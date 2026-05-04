import { Routes, Route, Navigate } from 'react-router-dom'
import { MapBuilderPage } from './pages/MapBuilderPage'

export default function App() {
  return (
    <Routes>
      <Route path="/map" element={<MapBuilderPage />} />
      <Route path="/" element={<Navigate to="/map" replace />} />
    </Routes>
  )
}
