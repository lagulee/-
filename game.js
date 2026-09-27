const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const livesEl = document.getElementById('lives');

// 벽돌 설정
const ROWS = 5;
const COLS = 8;
const BRICK_W = 50;
const BRICK_H = 20;
const BRICK_GAP = 6;
const BRICK_TOP = 50;
const BRICK_LEFT = (canvas.width - (COLS * BRICK_W + (COLS - 1) * BRICK_GAP)) / 2;
// 위쪽 줄일수록 높은 점수
const ROW_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db'];
const ROW_POINTS = [50, 40, 30, 20, 10];

const paddle = { w: 80, h: 12, x: 0, y: canvas.height - 30, speed: 7 };
const ball = { r: 7, x: 0, y: 0, dx: 0, dy: 0 };

let bricks = [];
let score = 0;
let lives = 3;
let level = 1;
let best = loadBest();
let state = 'ready'; // ready | playing | over | clear
const keys = { left: false, right: false };

function loadBest() {
  try { return Number(localStorage.getItem('brickBest')) || 0; } catch { return 0; }
}
function saveBest() {
  try { localStorage.setItem('brickBest', best); } catch { /* 저장 불가 시 무시 */ }
}

function buildBricks() {
  bricks = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      bricks.push({
        x: BRICK_LEFT + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        color: ROW_COLORS[r],
        points: ROW_POINTS[r],
        alive: true,
      });
    }
  }
}

function resetBall() {
  paddle.x = (canvas.width - paddle.w) / 2;
  ball.x = canvas.width / 2;
  ball.y = paddle.y - ball.r - 1;
  ball.dx = 0;
  ball.dy = 0;
}

function launchBall() {
  const speed = 4 + (level - 1) * 0.7;
  const angle = (Math.random() * 0.5 + 0.25) * Math.PI; // 45°~135° 사이
  ball.dx = Math.cos(angle) * speed;
  ball.dy = -Math.abs(Math.sin(angle) * speed);
  state = 'playing';
}

function newGame() {
  score = 0;
  lives = 3;
  level = 1;
  buildBricks();
  resetBall();
  updateHud();
  state = 'ready';
}

function updateHud() {
  if (score > best) {
    best = score;
    saveBest();
  }
  scoreEl.textContent = score;
  bestEl.textContent = best;
  livesEl.textContent = lives;
}

function handleAction() {
  if (state === 'ready') launchBall();
  else if (state === 'over') newGame();
  else if (state === 'clear') {
    level++;
    buildBricks();
    resetBall();
    state = 'ready';
  }
}

// 입력
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') keys.left = true;
  if (e.key === 'ArrowRight') keys.right = true;
  if (e.code === 'Space') { e.preventDefault(); handleAction(); }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false;
  if (e.key === 'ArrowRight') keys.right = false;
});
function movePaddleTo(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.w, x - paddle.w / 2));
}
canvas.addEventListener('mousemove', (e) => movePaddleTo(e.clientX));
canvas.addEventListener('touchmove', (e) => movePaddleTo(e.touches[0].clientX), { passive: true });
canvas.addEventListener('click', handleAction);

function update() {
  if (keys.left) paddle.x = Math.max(0, paddle.x - paddle.speed);
  if (keys.right) paddle.x = Math.min(canvas.width - paddle.w, paddle.x + paddle.speed);

  if (state === 'ready') {
    ball.x = paddle.x + paddle.w / 2;
    return;
  }
  if (state !== 'playing') return;

  ball.x += ball.dx;
  ball.y += ball.dy;

  // 벽 충돌
  if (ball.x - ball.r < 0) { ball.x = ball.r; ball.dx = Math.abs(ball.dx); }
  if (ball.x + ball.r > canvas.width) { ball.x = canvas.width - ball.r; ball.dx = -Math.abs(ball.dx); }
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.dy = Math.abs(ball.dy); }

  // 패들 충돌: 맞은 위치에 따라 반사 각도 변경
  if (
    ball.dy > 0 &&
    ball.y + ball.r >= paddle.y &&
    ball.y + ball.r <= paddle.y + paddle.h + ball.dy &&
    ball.x >= paddle.x - ball.r &&
    ball.x <= paddle.x + paddle.w + ball.r
  ) {
    const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1 ~ 1
    const speed = Math.hypot(ball.dx, ball.dy);
    const angle = Math.max(-1, Math.min(1, hit)) * (Math.PI / 3); // 최대 60°
    ball.dx = Math.sin(angle) * speed;
    ball.dy = -Math.cos(angle) * speed;
    ball.y = paddle.y - ball.r;
  }

  // 벽돌 충돌 (프레임당 하나만 처리)
  for (const b of bricks) {
    if (!b.alive) continue;
    const nearX = Math.max(b.x, Math.min(ball.x, b.x + BRICK_W));
    const nearY = Math.max(b.y, Math.min(ball.y, b.y + BRICK_H));
    const distX = ball.x - nearX;
    const distY = ball.y - nearY;
    if (distX * distX + distY * distY <= ball.r * ball.r) {
      b.alive = false;
      score += b.points * level;
      updateHud();
      // 옆면에 맞았으면 좌우 반사, 아니면 상하 반사
      if (Math.abs(distX) > Math.abs(distY)) ball.dx = -ball.dx;
      else ball.dy = -ball.dy;
      break;
    }
  }

  if (bricks.every((b) => !b.alive)) {
    score += 100 * level; // 스테이지 클리어 보너스
    updateHud();
    state = 'clear';
  }

  // 바닥에 떨어짐
  if (ball.y - ball.r > canvas.height) {
    lives--;
    updateHud();
    if (lives <= 0) state = 'over';
    else { resetBall(); state = 'ready'; }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const b of bricks) {
    if (!b.alive) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
  }

  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.fillStyle = '#888';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`레벨 ${level}`, 10, 25);

  const messages = {
    ready: ['스페이스바 또는 클릭으로 시작', ''],
    over: ['게임 오버', `최종 점수: ${score} · 스페이스바로 재시작`],
    clear: [`레벨 ${level} 클리어!`, '스페이스바로 다음 레벨'],
  };
  if (messages[state]) {
    const [title, sub] = messages[state];
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 + 40);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ccc';
    ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 70);
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

newGame();
loop();
