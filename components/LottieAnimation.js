import { useEffect, useRef } from "react";
import lottie from "lottie-web";

const LottieAnimation = ({ animationData, loop = true, autoplay = true, style }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const anim = lottie.loadAnimation({
      container: containerRef.current, // animasyonun oynatılacağı div
      renderer: "svg",
      loop,
      autoplay,
      animationData,
    });

    return () => anim.destroy(); // Bileşen kaldırıldığında animasyonu durdurun
  }, [animationData, loop, autoplay]);

  return <div ref={containerRef} style={style}></div>;
};

export default LottieAnimation;