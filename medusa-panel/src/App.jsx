import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout        from './components/Layout.jsx';
import Dashboard     from './pages/Dashboard.jsx';
import Relatorios    from './pages/Relatorios.jsx';
import Listas        from './pages/Listas.jsx';
import Aquecimento   from './pages/Aquecimento.jsx';
import Disparo       from './pages/Disparo.jsx';
import Configuracoes from './pages/Configuracoes.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index                  element={<Dashboard />} />
          <Route path="relatorios"      element={<Relatorios />} />
          <Route path="listas"          element={<Listas />} />
          <Route path="aquecimento"     element={<Aquecimento />} />
          <Route path="disparo"         element={<Disparo />} />
          <Route path="configuracoes"   element={<Configuracoes />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
