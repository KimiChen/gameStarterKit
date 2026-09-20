import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class modify_adjust_case_name_scope_1784419201000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        const indexes: { Key_name: string }[] = await queryRunner.query('SHOW INDEX FROM adjust_case')
        const names = new Set(indexes.map((index) => index.Key_name))
        if (names.has('uniq_adjust_case_parent_name')) return

        const dropOldIndex = names.has('uniq_adjust_case_name') ? 'DROP INDEX uniq_adjust_case_name,' : ''
        await queryRunner.query(`
        ALTER TABLE adjust_case
          ${dropOldIndex}
          ADD UNIQUE KEY uniq_adjust_case_parent_name (parent_id, name);`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const indexes: { Key_name: string }[] = await queryRunner.query('SHOW INDEX FROM adjust_case')
        const names = new Set(indexes.map((index) => index.Key_name))
        if (names.has('uniq_adjust_case_name')) return

        const dropNewIndex = names.has('uniq_adjust_case_parent_name') ? 'DROP INDEX uniq_adjust_case_parent_name,' : ''
        await queryRunner.query(`
        ALTER TABLE adjust_case
          ${dropNewIndex}
          ADD UNIQUE KEY uniq_adjust_case_name (name);`)
    }
}
