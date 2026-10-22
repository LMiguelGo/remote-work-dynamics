import React from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { iniciales, nombreUsuario, rolTexto } from '../utils/helpers';

export interface TabItem {
  label: string;
  target?: string;
  onSelect?: () => void;
}

interface TopBarProps {
  tabs?: TabItem[];
  activeIndex?: number;
  onTabChange?: (index: number) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ tabs = [], activeIndex = 0, onTabChange }) => {
  const { user, logout } = useAuth();

  if (!user) return null;
  const nombre = nombreUsuario(user);

  const handleTabClick = (t: TabItem, i: number) => {
    if (t.onSelect) {
      t.onSelect();
      return;
    }
    if (onTabChange) onTabChange(i);

    if (t.target) {
      const el = document.getElementById(t.target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-in">
        <div className="brand">
          <span className="mark">
            <Shield size={18} strokeWidth={2.4} />
          </span>
          Espacio laboral
        </div>

        {tabs.length > 0 && (
          <nav className="nav">
            {tabs.map((t, i) => (
              <button
                key={t.label}
                className={i === activeIndex ? 'active' : ''}
                onClick={() => handleTabClick(t, i)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="userchip">
          <div className="who">
            <b>{nombre}</b>
            <span>{rolTexto(user.rol)}</span>
          </div>
          <div className="avatar">{iniciales(nombre)}</div>
          <button className="logout" onClick={logout}>
            Salir
          </button>
        </div>
      </div>
    </header>
  );
};
