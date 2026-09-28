"use strict";

// Products get up to 5 ordered images. `image_url` stays as the denormalized cover
// (always image_urls[0]) so every existing display site keeps reading one field.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("products", "image_urls", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
    await queryInterface.sequelize.query(
      `UPDATE products SET image_urls = jsonb_build_array(image_url) WHERE image_url IS NOT NULL`,
    );
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("products", "image_urls");
  },
};
