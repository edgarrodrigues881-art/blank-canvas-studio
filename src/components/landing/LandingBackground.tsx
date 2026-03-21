const LandingBackground = () => {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{ contain: "strict" }}
    >
      {/* Single composited background — all gradients + grid + edge fade baked into one layer */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(to bottom, rgba(11,15,20,0.7) 0%, transparent 8%, transparent 92%, rgba(11,15,20,0.85) 100%),
            radial-gradient(800px 800px at 50% -15%, rgba(7,193,96,0.06) 0%, transparent 60%),
            radial-gradient(600px 600px at -8% 25%, rgba(7,193,96,0.04) 0%, transparent 60%),
            radial-gradient(600px 600px at 108% 45%, rgba(7,193,96,0.04) 0%, transparent 60%),
            radial-gradient(900px 600px at 50% 110%, rgba(7,193,96,0.05) 0%, transparent 55%)
          `,
        }}
      />
    </div>
  );
};

export default LandingBackground;
