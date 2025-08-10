// Tailwind v4 requires the separate PostCSS plugin '@tailwindcss/postcss'
import tailwind from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'

export default {
  plugins: [
    tailwind(),
    autoprefixer(),
  ],
}


