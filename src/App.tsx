import React from 'react'
import { AppRouter } from './app/router/AppRouter'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
          <p style={{ fontSize: 16, color: '#374151', fontWeight: 600 }}>Something went wrong</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ padding: '6px 16px', borderRadius: 8, background: '#7B3FF2', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14 }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  )
}

export default App
