import React from 'react';
import type { ConclusionDimensiones } from '../../types';

// Cierre del detalle de una persona: qué dimensiones se mueven juntas. La lectura la redacta un LLM en la analítica a partir de
// las correlaciones entre dimensiones; aquí solo se muestra, sin matriz. Si la analítica no la trae (no hay LLM configurado o
// falló), la sección no aparece.
export const LecturaDimensiones: React.FC<{ conclusion: ConclusionDimensiones | null | undefined }> = ({ conclusion }) => {
  if (!conclusion?.interpretacion) return null;
  return (
    <section className="an-conc" aria-label="Cómo se relacionan las dimensiones">
      <h4 className="an-sec">Cómo se relacionan las dimensiones</h4>
      <p className="an-corr-msg">{conclusion.interpretacion}</p>
      <p className="an-nota">{conclusion.aviso}</p>
    </section>
  );
};
