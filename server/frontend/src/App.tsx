import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { TopBar, type TabItem } from './components/TopBar';
import { LoginView } from './views/LoginView';
import { CambiarClaveView } from './views/CambiarClaveView';
import { AdminView } from './views/AdminView';
import { EmpleadoView } from './views/EmpleadoView';
import { LiderView } from './views/LiderView';
import { GerenteView } from './views/GerenteView';
import { OperacionView } from './views/OperacionView';

export const App: React.FC = () => {
  const { user, debeCambiarClave } = useAuth();
  const [gerenteSubView, setGerenteSubView] = useState<'organizacion' | 'operacion'>('organizacion');

  if (!user) {
    return <LoginView />;
  }

  // Clave temporal sin cambiar: nada más se usa hasta definir una propia.
  if (debeCambiarClave) {
    return <CambiarClaveView />;
  }

  let tabs: TabItem[] = [];
  let activeIndex = 0;

  if (user.rol === 'empleado') {
    tabs = [
      { label: 'Mi entorno' },
      { label: 'Umbrales', target: 'card-umbrales' },
      { label: 'Transparencia', target: 'card-transparencia' },
    ];
  } else if (user.rol === 'lider') {
    tabs = [
      { label: 'Equipo' },
      { label: 'Patrones', target: 'card-temporal' },
      { label: 'Preguntas', target: 'card-preguntas' },
    ];
  } else if (user.rol === 'gerente') {
    activeIndex = gerenteSubView === 'organizacion' ? 0 : 1;
    tabs = [
      { label: 'Organización', onSelect: () => setGerenteSubView('organizacion') },
      { label: 'Operación', onSelect: () => setGerenteSubView('operacion') },
    ];
  }

  return (
    <>
      <TopBar tabs={tabs} activeIndex={activeIndex} />
      <main id="app">
        {user.rol === 'admin' && <AdminView />}
        {user.rol === 'empleado' && <EmpleadoView />}
        {user.rol === 'lider' && <LiderView />}
        {user.rol === 'gerente' &&
          (gerenteSubView === 'organizacion' ? <GerenteView /> : <OperacionView />)}
      </main>
    </>
  );
};

export default App;
