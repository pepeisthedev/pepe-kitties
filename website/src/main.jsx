import './appkitConfig';
import { StrictMode } from 'react'

import { createRoot } from 'react-dom/client'

import { queryClient } from './appkitConfig';
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'

import { QueryClientProvider } from '@tanstack/react-query'



createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
