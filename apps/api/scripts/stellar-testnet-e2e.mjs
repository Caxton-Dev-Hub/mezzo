#!/usr/bin/env node
// Exercises the real HorizonStellarProvider against Stellar testnet: provisions
// an issuer, a custody account, a buyer and a seller, funds a trustline, pays
// the custody account with an escrow memo, reads that payment back through the
// provider, and pays the seller out. Run `pnpm --filter @mezzo/api build` first.
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { HorizonStellarProvider } from '../dist/stellar/providers/horizon-stellar.provider.js';
import { toStellarAmount, fromStellarAmount } from '../dist/stellar/stellar-amount.js';
import { escrowMemo } from '../dist/stellar/escrow-memo.js';
import { isStellarAccountId } from '../dist/stellar/stellar-account-id.js';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const ASSET_CODE = 'USDC';
const ESCROW_ID = '11111111-2222-3333-4444-555555555555';
const PRICE_CENTS = 100_000;
const FEE_BPS = 250;

const server = new Horizon.Server(HORIZON_URL);

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function stubConfig(values) {
  return {
    getOrThrow(key) {
      if (!(key in values)) {
        throw new Error(`Unexpected config key ${key}`);
      }
      return values[key];
    },
    get(key) {
      return values[key];
    },
  };
}

async function fundFromFriendbot(keypair) {
  const response = await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`);
  if (!response.ok) {
    throw new Error(`Friendbot refused ${keypair.publicKey()}: ${response.status}`);
  }
}

async function submit(sourceKeypair, buildOperations, memo) {
  const account = await server.loadAccount(sourceKeypair.publicKey());
  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });
  for (const operation of buildOperations()) {
    builder = builder.addOperation(operation);
  }
  if (memo) {
    builder = builder.addMemo(Memo.text(memo));
  }
  const transaction = builder.setTimeout(90).build();
  transaction.sign(sourceKeypair);
  return server.submitTransaction(transaction);
}

async function balanceOf(publicKey, asset) {
  const account = await server.loadAccount(publicKey);
  const holding = account.balances.find(
    (balance) => balance.asset_code === asset.getCode() && balance.asset_issuer === asset.getIssuer(),
  );
  return holding ? holding.balance : '0';
}

async function main() {
  console.log('Stellar testnet end-to-end\n');

  const issuer = Keypair.random();
  const custody = Keypair.random();
  const buyer = Keypair.random();
  const seller = Keypair.random();
  const asset = new Asset(ASSET_CODE, issuer.publicKey());

  console.log('provisioning accounts');
  await Promise.all([issuer, custody, buyer, seller].map(fundFromFriendbot));
  check('four testnet accounts funded by friendbot', true);
  check('custody account id passes our own StrKey check', isStellarAccountId(custody.publicKey()));

  console.log('\nopening trustlines and issuing USDC');
  for (const holder of [custody, buyer, seller]) {
    await submit(holder, () => [Operation.changeTrust({ asset })]);
  }
  await submit(issuer, () => [
    Operation.payment({ destination: buyer.publicKey(), asset, amount: '5000.0000000' }),
  ]);
  check('buyer holds issued USDC', (await balanceOf(buyer.publicKey(), asset)) === '5000.0000000');

  const provider = new HorizonStellarProvider(
    stubConfig({
      STELLAR_NETWORK: 'testnet',
      STELLAR_ASSET_CODE: ASSET_CODE,
      STELLAR_ASSET_ISSUER: issuer.publicKey(),
      STELLAR_HORIZON_URL: HORIZON_URL,
      STELLAR_CUSTODY_SECRET: custody.secret(),
    }),
  );

  console.log('\nmoney in: buyer funds the escrow');
  const deposit = await provider.openDepositAddress(ESCROW_ID);
  check('deposit address is the custody account', deposit.accountId === custody.publicKey());
  check('memo is the escrow id and fits MEMO_TEXT', deposit.memo === escrowMemo(ESCROW_ID) && deposit.memo.length <= 28);

  const price = { amount: PRICE_CENTS, currency: 'USD' };
  const priceOnChain = toStellarAmount(price);
  const depositTx = await submit(
    buyer,
    () => [Operation.payment({ destination: deposit.accountId, asset, amount: priceOnChain })],
    deposit.memo,
  );
  check('buyer payment accepted by the network', Boolean(depositTx.hash));

  console.log('\nverification: the provider reads the payment back');
  const payment = await provider.findPayment(depositTx.hash);
  check('payment is found by transaction hash', payment !== null);
  if (payment) {
    check('destination matches the deposit address', payment.to === deposit.accountId);
    check('memo round-trips through the network', payment.memo === deposit.memo);
    check('asset code and issuer match', payment.asset.code === ASSET_CODE && payment.asset.issuer === issuer.publicKey());
    check('amount matches the escrow price to the cent', payment.amount === priceOnChain);
    check('amount converts back to the exact minor units', fromStellarAmount(payment.amount).amount === PRICE_CENTS);
  }

  const unknownHash = 'f'.repeat(64);
  check('an unknown transaction hash reads as null, not an error', (await provider.findPayment(unknownHash)) === null);

  console.log('\nmoney out: custody pays the seller, net of the platform fee');
  const feeCents = Math.floor((PRICE_CENTS * FEE_BPS) / 10_000);
  const netOnChain = toStellarAmount({ amount: PRICE_CENTS - feeCents, currency: 'USD' });
  const payoutHash = await provider.sendPayment({
    from: deposit.accountId,
    to: seller.publicKey(),
    amount: netOnChain,
    memo: deposit.memo,
  });
  check('payout submitted and returned a hash', /^[0-9a-f]{64}$/.test(payoutHash));
  check('seller received the net amount', (await balanceOf(seller.publicKey(), asset)) === netOnChain);
  check(
    'custody retains exactly the platform fee',
    (await balanceOf(custody.publicKey(), asset)) === toStellarAmount({ amount: feeCents, currency: 'USD' }),
  );

  console.log('\nrefusals');
  let refused = false;
  try {
    await provider.sendPayment({
      from: buyer.publicKey(),
      to: seller.publicKey(),
      amount: '1.0000000',
      memo: deposit.memo,
    });
  } catch {
    refused = true;
  }
  check('refuses to pay from an account it holds no key for', refused);

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
