import React from 'react';

interface PageHeadProps {
  title: string;
  subtitle: string;
  pill: string;
}

export const PageHead: React.FC<PageHeadProps> = ({ title, subtitle, pill }) => {
  return (
    <div className="pagehead">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <span className="viewpill">
        <span className="d" /> Vista: {pill}
      </span>
    </div>
  );
};
