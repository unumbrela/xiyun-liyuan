import React from 'react'
import ReactDOM from 'react-dom/client'
import './echartsTheme'  // 注册 opera-dark 主题（须在任何图表渲染前）
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
