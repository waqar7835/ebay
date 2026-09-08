"use strict";

module.exports = {
  up: async (queryInterface) => {
    const sequelize = queryInterface.sequelize;

    await sequelize.transaction(async (transaction) => {
      const superAdmins = await sequelize.query(
        `SELECT u.id, u.name, u.email, u.password_hash, u.status, u.created_at, u.updated_at
         FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'SUPER_ADMIN'`,
        { type: sequelize.QueryTypes.SELECT, transaction },
      );

      for (const admin of superAdmins) {
        await sequelize.query(
          `INSERT INTO backoffice_users (id, name, email, password_hash, status, role, created_at, updated_at)
           VALUES (:id, :name, :email, :passwordHash, :status, 'SUPER_ADMIN', :createdAt, :updatedAt)
           ON CONFLICT (id) DO NOTHING`,
          {
            replacements: {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              passwordHash: admin.password_hash,
              status: admin.status,
              createdAt: admin.created_at,
              updatedAt: admin.updated_at,
            },
            transaction,
          },
        );

        await sequelize.query(`DELETE FROM user_roles WHERE user_id = :id AND role = 'SUPER_ADMIN'`, {
          replacements: { id: admin.id },
          transaction,
        });

        const remaining = await sequelize.query(
          `SELECT COUNT(*)::int AS count FROM user_roles WHERE user_id = :id`,
          { replacements: { id: admin.id }, transaction, type: sequelize.QueryTypes.SELECT },
        );

        if (Number(remaining[0].count) === 0) {
          await sequelize.query(`DELETE FROM users WHERE id = :id`, { replacements: { id: admin.id }, transaction });
        }
      }
    });
  },
  down: async (queryInterface) => {
    const sequelize = queryInterface.sequelize;

    await sequelize.transaction(async (transaction) => {
      const superAdmins = await sequelize.query(
        `SELECT id, name, email, password_hash, status, created_at, updated_at
         FROM backoffice_users WHERE role = 'SUPER_ADMIN'`,
        { type: sequelize.QueryTypes.SELECT, transaction },
      );

      for (const admin of superAdmins) {
        await sequelize.query(
          `INSERT INTO users (id, company_id, name, email, password_hash, status, created_at, updated_at)
           VALUES (:id, NULL, :name, :email, :passwordHash, :status, :createdAt, :updatedAt)
           ON CONFLICT (id) DO NOTHING`,
          {
            replacements: {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              passwordHash: admin.password_hash,
              status: admin.status,
              createdAt: admin.created_at,
              updatedAt: admin.updated_at,
            },
            transaction,
          },
        );

        await sequelize.query(
          `INSERT INTO user_roles (id, user_id, role) VALUES (gen_random_uuid(), :id, 'SUPER_ADMIN')`,
          { replacements: { id: admin.id }, transaction },
        );

        await sequelize.query(`DELETE FROM backoffice_users WHERE id = :id`, {
          replacements: { id: admin.id },
          transaction,
        });
      }
    });
  },
};
