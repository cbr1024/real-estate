import { Routes, Route } from 'react-router-dom';
import Header from './components/Common/Header';
import MapPage from './pages/MapPage';
import DetailPage from './pages/DetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FavoritesPage from './pages/FavoritesPage';

function App() {
  return (
    <div className="flex flex-col h-full min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/apartment/:id" element={<DetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
