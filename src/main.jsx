import React from 'react'
import ReactDOM from 'react-dom/client'
// Шрифты лежат в node_modules и собираются вместе с приложением: без обращения
// к Google Fonts они не зависят от сети и не мигают подменой при загрузке.
// Оба варианта включают кириллицу.
import '@fontsource/russo-one' // заголовки и слова на карточках, только вес 400
import '@fontsource-variable/roboto' // весь остальной текст, веса 100–900
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
