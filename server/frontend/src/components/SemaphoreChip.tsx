import React from 'react';
import type { SemaphoreLevel } from '../types';
import { SEM_LABEL } from '../utils/helpers';

interface SemaphoreChipProps {
  level: SemaphoreLevel;
  text?: React.ReactNode;
  className?: string;
}

export const SemaphoreChip: React.FC<SemaphoreChipProps> = ({ level, text, className = '' }) => {
  return (
    <span className={`sem ${level} ${className}`.trim()}>
      {text !== undefined ? text : SEM_LABEL[level]}
    </span>
  );
};
