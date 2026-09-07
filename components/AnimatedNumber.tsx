"use client";

import { useState, useEffect } from "react";

function AnimatedNumber({ value,style }: { value: number, style?: React.CSSProperties }) {
  const [currentValue, setCurrentValue] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const duration = 2000; // Animasyon süresi (ms)
    const startValue = currentValue;
    const endValue = value;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = (timestamp - startTime) / duration;
      const newValue = Math.min(startValue + (endValue - startValue) * progress, endValue);
      
      setCurrentValue(newValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span style={style}>{Math.round(currentValue).toLocaleString()}</span>;
}

export default AnimatedNumber;