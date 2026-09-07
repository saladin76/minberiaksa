import React from "react";

const Spinner = ({ className = "" }) => (
  <div className={`animate-spin rounded-full border-t-2 border-emerald-500 ${className}`} style={{ width: '1em', height: '1em' }} />
);

export default Spinner; 