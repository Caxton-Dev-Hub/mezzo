import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedInitialPowerbanks1787800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const shops: Array<{ id: string }> = await queryRunner.query('SELECT id FROM shops LIMIT 1');
    
    if (shops.length === 0) {
      console.log('No shops found, skipping powerbank seeding. Please create a shop first.');
      return;
    }

    const shopId = shops[0].id;

    for (let i = 1; i <= 5; i++) {
      await queryRunner.query(
        `INSERT INTO powerbanks (shop_id, number, status, replacement_price_amount, replacement_price_currency, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [shopId, i.toString(), 'AVAILABLE', '1500000', 'NGN'],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM powerbanks WHERE number IN ('1', '2', '3', '4', '5')`);
  }
}
