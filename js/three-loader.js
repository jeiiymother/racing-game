const THREE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js',
  'https://fastly.jsdelivr.net/npm/three@0.150.0/build/three.min.js',
  'https://unpkg.com/three@0.150.0/build/three.min.js',
  'https://registry.npmmirror.com/three/0.150.0/files/build/three.min.js',
  'https://cdn.bootcdn.net/ajax/libs/three.js/0.150.0/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.150.0/three.min.js'
];

window.GameModules = window.GameModules || {};
window.GameModules.loadThree = function(index, onLoad, onError) {
  if (typeof window.THREE !== 'undefined') {
    onLoad();
    return;
  };
  if (index >= THREE_SOURCES.length) {
    onError();
    return;
  }

  const script = document.createElement('script');
  script.src = THREE_SOURCES[index];
  script.onload = () => {
    if (typeof window.THREE !== 'undefined') onLoad();
    else window.GameModules.loadThree(index + 1, onLoad, onError);
  };
  script.onerror = () => window.GameModules.loadThree(index + 1, onLoad, onError);
  document.head.appendChild(script);
}
