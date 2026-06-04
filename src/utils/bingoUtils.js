const { BINGO_COLUMNS } = require('../config/constants');

/**
 * Generate a standard 5x5 Bingo card
 * B: 1-15, I: 16-30, N: 31-45 (center = FREE), G: 46-60, O: 61-75
 */
function generateBingoCard() {
  const columns = ['B', 'I', 'N', 'G', 'O'];
  const card = {};

  columns.forEach((col) => {
    const { min, max } = BINGO_COLUMNS[col];
    const nums = getUniqueRandomNumbers(min, max, 5);
    nums.sort((a, b) => a - b);
    card[col] = nums;
  });

  // Center square is FREE space
  card['N'][2] = 0; // 0 represents FREE

  return card;
}

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
 * Flatten a card to a 2D 5x5 grid for frontend display
 * Returns array of rows, each row is an array of 5 cells
 */
function cardToGrid(card) {
  const grid = [];
  for (let row = 0; row < 5; row++) {
    const rowArr = [];
    for (const col of ['B', 'I', 'N', 'G', 'O']) {
      rowArr.push({
        column: col,
        number: card[col][row],
        marked: card[col][row] === 0, // FREE space is pre-marked
      });
    }
    grid.push(rowArr);
  }
  return grid;
}

/**
 * Check if a card has BINGO given the called numbers
 * Returns: { won: true, type, index } describing the winning line, or null
 */
function checkBingo(card, calledNumbers, pattern = 'any_line') {
  const calledSet = new Set(calledNumbers);
  const grid = cardToGrid(card);

  if (pattern === 'full_card') {
    const won = grid.every(row => row.every(cell => cell.number === 0 || calledSet.has(cell.number)));
    return won ? { won: true, type: 'full_card' } : null;
  }

  if (pattern === 'four_corners') {
    const won = (
      isMarked(grid[0][0], calledSet) &&
      isMarked(grid[0][4], calledSet) &&
      isMarked(grid[4][0], calledSet) &&
      isMarked(grid[4][4], calledSet)
    );
    return won ? { won: true, type: 'four_corners' } : null;
  }

  // any_line: check all rows
  for (let r = 0; r < 5; r++) {
    if (grid[r].every(cell => isMarked(cell, calledSet))) {
      return { won: true, type: 'row', index: r };
    }
  }

  // check all columns
  for (let c = 0; c < 5; c++) {
    if (grid.every(row => isMarked(row[c], calledSet))) {
      return { won: true, type: 'column', index: c };
    }
  }

  // check diagonals
  if (
    isMarked(grid[0][0], calledSet) &&
    isMarked(grid[1][1], calledSet) &&
    isMarked(grid[2][2], calledSet) &&
    isMarked(grid[3][3], calledSet) &&
    isMarked(grid[4][4], calledSet)
  ) return { won: true, type: 'diagonal', index: 0 };

  if (
    isMarked(grid[0][4], calledSet) &&
    isMarked(grid[1][3], calledSet) &&
    isMarked(grid[2][2], calledSet) &&
    isMarked(grid[3][1], calledSet) &&
    isMarked(grid[4][0], calledSet)
  ) return { won: true, type: 'diagonal', index: 1 };

  return null;
}

function isMarked(cell, calledSet) {
  return cell.number === 0 || calledSet.has(cell.number);
}

/**
 * Generate sequence of all 75 bingo numbers shuffled
 */
function generateDrawSequence() {
  const numbers = Array.from({ length: 75 }, (_, i) => i + 1);
  // Fisher-Yates shuffle
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return numbers;
}

module.exports = { generateBingoCard, cardToGrid, checkBingo, generateDrawSequence };
