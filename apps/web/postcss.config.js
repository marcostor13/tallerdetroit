module.exports = {
  plugins: {
    // Inlina los @import ANTES de Tailwind, para que las directivas @layer de
    // _base.css lleguen a Tailwind y se coloquen en la capa correcta.
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
