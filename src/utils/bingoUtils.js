const { BINGO_COLUMNS } = require('../config/constants');

/**
 * 75-Ball Column Ranges
 */
const COL_RANGES_75 = BINGO_COLUMNS || {
  B: { min: 1, max: 15 },
  I: { min: 16, max: 30 },
  N: { min: 31, max: 45 },
  G: { min: 46, max: 60 },
  O: { min: 61, max: 75 },
};

/**
 * Get N unique random integers between min and max (inclusive)
 */
function getUniqueRandomNumbers(min, max, count) {
  const numbers = new Set();
  while (numbers.size < count) {
    numbers.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  return Array.from(numbers);
}

/**
 * Generate a standard 5x5 Bingo card (75-ball)
 * B: 1-15, I: 16-30, N: 31-45 (center = FREE [0]), G: 46-60, O: 61-75
 */
function generateBingoCard() {
  const columns = ['B', 'I', 'N', 'G', 'O'];
  const card = {};

  columns.forEach((col) => {
    const { min, max } = COL_RANGES_75[col];
    const nums = getUniqueRandomNumbers(min, max, 5);
    nums.sort((a, b) => a - b);
    card[col] = nums;
  });

  // Center square is FREE space (0)
  card['N'][2] = 0;

  return card;
}

/**
 * Generate a 90-ball card (9 columns x 3 rows)
 * Each row has 5 numbers and 4 blanks (0).
 * Columns are 1-9, 10-19, 20-29, 30-39, 40-49, 50-59, 60-69, 70-79, 80-90.
 */
function generate90BallCard() {
  const colRanges = [
    { min: 1, max: 9 },
    { min: 10, max: 19 },
    { min: 20, max: 29 },
    { min: 30, max: 39 },
    { min: 40, max: 49 },
    { min: 50, max: 59 },
    { min: 60, max: 69 },
    { min: 70, max: 79 },
    { min: 80, max: 90 },
  ];

  // Pick 15 numbers total: 1-2 per column
  const grid = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  for (let c = 0; c < 9; c++) {
    const r = Math.floor(Math.random() * 3);
    const num = Math.floor(Math.random() * (colRanges[c].max - colRanges[c].min + 1)) + colRanges[c].min;
    grid[r][c] = num;
  }

  // Fill up to 5 numbers per row
  for (let r = 0; r < 3; r++) {
    let count = grid[r].filter(n => n > 0).length;
    while (count < 5) {
      const c = Math.floor(Math.random() * 9);
      if (grid[r][c] === 0) {
        const num = Math.floor(Math.random() * (colRanges[c].max - colRanges[c].min + 1)) + colRanges[c].min;
        // ensure unique in column
        const inCol = [grid[0][c], grid[1][c], grid[2][c]];
        if (!inCol.includes(num)) {
          grid[r][c] = num;
          count++;
        }
      }
    }
  }

  // Sort numbers in each column ascending
  for (let c = 0; c < 9; c++) {
    const colNums = [grid[0][c], grid[1][c], grid[2][c]].filter(n => n > 0).sort((a, b) => a - b);
    let idx = 0;
    for (let r = 0; r < 3; r++) {
      if (grid[r][c] > 0) {
        grid[r][c] = colNums[idx++];
      }
    }
  }

  return { grid };
}

/**
 * Flatten a 75-ball card to a 2D 5x5 grid for frontend display
 * Returns array of rows, each row is an array of 5 cells
 */
function cardToGrid(card) {
  if (!card) return [];
  // If already grid
  if (Array.isArray(card)) return card;
  if (card.grid && Array.isArray(card.grid)) return card.grid;

  const grid = [];
  const cols = ['B', 'I', 'N', 'G', 'O'];
  for (let row = 0; row < 5; row++) {
    const rowArr = [];
    for (const col of cols) {
      const colData = card[col] || [];
      const num = colData[row] !== undefined ? colData[row] : 0;
      rowArr.push({
        column: col,
        number: num,
        marked: num === 0, // FREE space is pre-marked
      });
    }
    grid.push(rowArr);
  }
  return grid;
}

function isCellMarked(cell, calledSet) {
  if (!cell) return false;
  const num = typeof cell === 'object' ? cell.number : cell;
  return num === 0 || calledSet.has(num);
}

/**
 * Check if a card has achieved a BINGO win given the called numbers
 * Supports: 'any_line', 'horizontal_line', 'vertical_line', 'diagonal_line', 'four_corners', 'full_card' / 'full_house', 'multi_line'
 */
function checkBingo(card, calledNumbers, pattern = 'any_line') {
  if (!card || !Array.isArray(calledNumbers)) return null;
  const calledSet = new Set(calledNumbers);
  const grid = cardToGrid(card);

  // 1. Full Card / Full House (all 25 squares)
  if (pattern === 'full_card' || pattern === 'full_house' || pattern === 'blackout') {
    const won = grid.every(row => row.every(cell => isCellMarked(cell, calledSet)));
    return won ? { won: true, type: 'full_card' } : null;
  }

  // 2. Four Corners
  if (pattern === 'four_corners' || pattern === 'any_line') {
    const wonCorners = (
      isCellMarked(grid[0][0], calledSet) &&
      isCellMarked(grid[0][4], calledSet) &&
      isCellMarked(grid[4][0], calledSet) &&
      isCellMarked(grid[4][4], calledSet)
    );
    if (pattern === 'four_corners') {
      return wonCorners ? { won: true, type: 'four_corners' } : null;
    }
  }

  // Rows (horizontal lines)
  if (pattern === 'any_line' || pattern === 'horizontal_line' || pattern === 'multi_line') {
    for (let r = 0; r < 5; r++) {
      if (grid[r].every(cell => isCellMarked(cell, calledSet))) {
        return { won: true, type: 'row', index: r };
      }
    }
  }

  // Columns (vertical lines)
  if (pattern === 'any_line' || pattern === 'vertical_line' || pattern === 'multi_line') {
    for (let c = 0; c < 5; c++) {
      if (grid.every(row => isCellMarked(row[c], calledSet))) {
        return { won: true, type: 'column', index: c };
      }
    }
  }

  // Diagonals
  if (pattern === 'any_line' || pattern === 'diagonal_line' || pattern === 'multi_line') {
    const diag1 = [grid[0][0], grid[1][1], grid[2][2], grid[3][3], grid[4][4]];
    if (diag1.every(cell => isCellMarked(cell, calledSet))) {
      return { won: true, type: 'diagonal', index: 0 };
    }

    const diag2 = [grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]];
    if (diag2.every(cell => isCellMarked(cell, calledSet))) {
      return { won: true, type: 'diagonal', index: 1 };
    }
  }

  return null;
}

/**
 * Check if a card is ONE number away from BINGO ("ON FIRE")
 * Returns { isOneAway: true, neededNumbers: [number], bestLine: string } or null
 */
function checkOneAway(card, calledNumbers, pattern = 'any_line') {
  if (!card || !Array.isArray(calledNumbers)) return null;
  const calledSet = new Set(calledNumbers);
  const grid = cardToGrid(card);
  const neededNumbers = new Set();

  const checkLine = (cells, label) => {
    const unmarked = cells.filter(cell => !isCellMarked(cell, calledSet));
    if (unmarked.length === 1) {
      const num = typeof unmarked[0] === 'object' ? unmarked[0].number : unmarked[0];
      if (num > 0) neededNumbers.add(num);
      return label;
    }
    return null;
  };

  let bestLabel = null;

  // Check rows
  for (let r = 0; r < 5; r++) {
    const res = checkLine(grid[r], `Row ${r + 1}`);
    if (res && !bestLabel) bestLabel = res;
  }

  // Check columns
  for (let c = 0; c < 5; c++) {
    const colCells = grid.map(row => row[c]);
    const res = checkLine(colCells, `Column ${['B','I','N','G','O'][c]}`);
    if (res && !bestLabel) bestLabel = res;
  }

  // Check diagonals
  const diag1 = [grid[0][0], grid[1][1], grid[2][2], grid[3][3], grid[4][4]];
  const d1Res = checkLine(diag1, 'Diagonal \\');
  if (d1Res && !bestLabel) bestLabel = d1Res;

  const diag2 = [grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]];
  const d2Res = checkLine(diag2, 'Diagonal /');
  if (d2Res && !bestLabel) bestLabel = d2Res;

  if (neededNumbers.size > 0) {
    return {
      isOneAway: true,
      neededNumbers: Array.from(neededNumbers),
      bestLine: bestLabel || 'Line',
    };
  }

  return null;
}

/**
 * Generate sequence of all 75 bingo numbers shuffled (Fisher-Yates)
 */
function generateDrawSequence(totalBalls = 75) {
  const numbers = Array.from({ length: totalBalls }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return numbers;
}

module.exports = {
  generateBingoCard,
  generate90BallCard,
  cardToGrid,
  checkBingo,
  checkOneAway,
  generateDrawSequence,
};
