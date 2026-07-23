const words = ['Concevoir', 'Planifier', 'Connecter', 'Exporter', 'Design', 'Plan', 'Connect', 'Export'];
const target = document.getElementById('typewriter');
let wordIndex = 0;
let charIndex = 0;
let deleting = false;

function typeLoop() {
  const word = words[wordIndex];
  target.textContent = word.slice(0, charIndex);

  if (!deleting && charIndex < word.length) {
    charIndex++;
    setTimeout(typeLoop, 95);
    return;
  }

  if (!deleting && charIndex === word.length) {
    deleting = true;
    setTimeout(typeLoop, 1050);
    return;
  }

  if (deleting && charIndex > 0) {
    charIndex--;
    setTimeout(typeLoop, 42);
    return;
  }

  deleting = false;
  wordIndex = (wordIndex + 1) % words.length;
  setTimeout(typeLoop, 180);
}

typeLoop();
