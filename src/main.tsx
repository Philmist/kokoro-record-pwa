import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { initHistoryDepth } from './ui/history.ts'

// 起動時の履歴エントリをアプリの入口（深さ 0）として記録しておく。
initHistoryDepth()

render(<App />, document.getElementById('app')!)
