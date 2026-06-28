import React from 'react'
import ErrorState from './ErrorState'

// 捕获子树渲染期异常（如数据形状异常），避免整页白屏；按 resetKey 变化自动复位。
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[module error]', error, info)
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          message={'此模块渲染出错：' + (this.state.error.message || '未知错误')}
          hint="可切换其他模块或刷新页面。"
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}
