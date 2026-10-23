(() => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Update the single active favicon link so browsers display the animated frames.
    const icon = document.getElementById('animated-favicon') || document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/png';
    icon.sizes = '96x96';
    if (!icon.isConnected) document.head.appendChild(icon);

    let phase = 0;
    const render = () => {
      const size = canvas.width;
      const center = size / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#151515';
      ctx.fillRect(0, 0, size, size);

      // The two orbital strokes rotate in opposite directions.
      const orbit = (radius, dash, rotation, opacity, width) => {
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(rotation);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.setLineDash(dash);
        ctx.lineDashOffset = phase * 1.7;
        ctx.strokeStyle = `rgba(242, 242, 242, ${opacity})`;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      };
      orbit(40, [148, 104], phase * 0.7, 1, 3.2);
      orbit(28, [84, 92], -phase, 0.62, 3);

      // Keep the project's central hexagonal mark steady with a subtle pulse.
      const pulse = 1 + Math.sin(phase * 1.5) * 0.06;
      ctx.save();
      ctx.translate(center, center);
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(22, -9.3);
      ctx.lineTo(22, 15.3);
      ctx.lineTo(0, 28);
      ctx.lineTo(-22, 15.3);
      ctx.lineTo(-22, -9.3);
      ctx.closePath();
      ctx.fillStyle = '#f2f2f2';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(0, 3);
      ctx.moveTo(22, -9.3);
      ctx.lineTo(0, 3);
      ctx.lineTo(-22, -9.3);
      ctx.strokeStyle = '#151515';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();

      // Changing the PNG data URL updates the browser-tab icon.
      icon.href = canvas.toDataURL('image/png');
      phase += 0.52;
    };

    render();
    window.setInterval(() => {
      if (document.visibilityState === 'visible') render();
    }, 100);
  } catch (error) {
    // Keep the static favicon available if animation is unsupported.
  }
})();
