(function() {
  const AI_ROSTER = [
    { id: 'ai-1', name: 'A. Chen', pace: 82, color: 0xe64b3c, vehicle: 'Porsche 911 GT3 R', mass: 1250, length: 5.15, width: 2.48 },
    { id: 'ai-2', name: 'M. Rossi', pace: 81, color: 0x3278d4, vehicle: 'Mercedes-AMG GT3', mass: 1330, length: 5.42, width: 2.55 },
    { id: 'ai-3', name: 'L. Weber', pace: 80, color: 0xf0c52d, vehicle: 'Audi R8 LMS GT3', mass: 1290, length: 5.36, width: 2.52 },
    { id: 'ai-4', name: 'S. Kim', pace: 79, color: 0x9b59b6, vehicle: 'McLaren 720S GT3', mass: 1240, length: 5.28, width: 2.50 },
    { id: 'ai-5', name: 'J. Silva', pace: 78, color: 0xf28c28, vehicle: 'Lamborghini Huracán GT3', mass: 1300, length: 5.43, width: 2.55 },
    { id: 'ai-6', name: 'N. Park', pace: 77, color: 0x26a69a, vehicle: 'BMW M4 GT3', mass: 1320, length: 5.48, width: 2.58 },
    { id: 'ai-7', name: 'D. Miller', pace: 76, color: 0xd6e0e8, vehicle: 'Aston Martin Vantage GT3', mass: 1300, length: 5.35, width: 2.53 }
  ];

  const AI_SKILLS = {
    amateur: { label: '业余', pace: 0.82, grip: 0.60, accel: 3.8, brake: 7.5, aggression: 0.55, errorChance: 0.06 },
    pro: { label: '专业', pace: 1.00, grip: 0.78, accel: 6.8, brake: 13.0, aggression: 0.90, errorChance: 0.012 },
    master: { label: '大师', pace: 1.12, grip: 0.91, accel: 9.0, brake: 18.0, aggression: 1.00, errorChance: 0.002 }
  };

  function assignAISkills(aiDrivers) {
    const pool = ['amateur', 'amateur', 'pro', 'pro', 'pro', 'master', 'master'];
    for (let index = pool.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    aiDrivers.forEach((driver, index) => {
      driver.skill = AI_SKILLS[pool[index]];
    });
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.ai = { AI_ROSTER, AI_SKILLS, assignAISkills };
})();
