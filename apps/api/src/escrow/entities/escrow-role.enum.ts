export enum EscrowRole {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
}

export function opposite(role: EscrowRole): EscrowRole {
  return role === EscrowRole.BUYER ? EscrowRole.SELLER : EscrowRole.BUYER;
}
