import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SignInPage } from './pages/SignInPage'
import { CreateAccountPage } from './pages/CreateAccountPage'
import { CompleteSetupPage } from './pages/CompleteSetupPage'
import { MapBuilderPage } from './pages/MapBuilderPage'

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/create-account" element={<CreateAccountPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/complete-setup" element={<CompleteSetupPage />} />
        <Route path="/map" element={<MapBuilderPage />} />
        <Route path="/" element={<Navigate to="/map" replace />} />
      </Route>
    </Routes>
  )
}
