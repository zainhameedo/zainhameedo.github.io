document.addEventListener("DOMContentLoaded", function() {
    // Theme toggling
    const themeToggle = document.querySelector('.theme-toggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Initialize theme
    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && prefersDarkScheme.matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Theme toggle click handler
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Intersection Observer for fade-in animations
    const observerOptions = {
        root: null,
        threshold: 0.1,
        rootMargin: '0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all sections for animation
    document.querySelectorAll('section').forEach(section => {
        section.classList.add('fade-in');
        observer.observe(section);
    });

    // Maze Implementation
    const GRID_SIZE = 15;
    const WALL_PROBABILITY = 0.3;
    let startCell = null;
    let endCell = null;
    let isSettingStart = true;
    let maze = [];
    
    function createMaze() {
        const mazeGrid = document.getElementById('mazeGrid');
        mazeGrid.innerHTML = '';
        maze = [];

        for (let i = 0; i < GRID_SIZE; i++) {
            const row = [];
            for (let j = 0; j < GRID_SIZE; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                
                // Add walls randomly
                if (Math.random() < WALL_PROBABILITY) {
                    cell.classList.add('wall');
                }
                
                cell.addEventListener('click', handleCellClick);
                mazeGrid.appendChild(cell);
                row.push(cell);
            }
            maze.push(row);
        }
    }

    function handleCellClick(event) {
        const cell = event.target;
        if (cell.classList.contains('wall')) return;

        if (isSettingStart) {
            if (startCell) {
                startCell.classList.remove('start');
            }
            cell.classList.add('start');
            startCell = cell;
            isSettingStart = false;
        } else {
            if (endCell) {
                endCell.classList.remove('end');
            }
            cell.classList.add('end');
            endCell = cell;
            isSettingStart = true;
            
            // Start pathfinding when both points are set
            if (startCell && endCell) {
                clearPath();
                const algorithm = document.getElementById('algorithm').value;
                if (algorithm === 'bfs') {
                    bfs();
                } else {
                    dfs();
                }
            }
        }
    }

    function clearPath() {
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('path', 'visited');
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function bfs() {
        const start = {
            row: parseInt(startCell.dataset.row),
            col: parseInt(startCell.dataset.col)
        };
        const end = {
            row: parseInt(endCell.dataset.row),
            col: parseInt(endCell.dataset.col)
        };

        const queue = [[start]];
        const visited = new Set();

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];
            const key = `${current.row},${current.col}`;

            if (visited.has(key)) continue;
            visited.add(key);

            const cell = maze[current.row][current.col];
            if (cell !== startCell && cell !== endCell) {
                cell.classList.add('visited');
            }

            if (current.row === end.row && current.col === end.col) {
                await visualizePath(path);
                return;
            }

            const directions = [
                {row: -1, col: 0}, // up
                {row: 1, col: 0},  // down
                {row: 0, col: -1}, // left
                {row: 0, col: 1}   // right
            ];

            for (const dir of directions) {
                const newRow = current.row + dir.row;
                const newCol = current.col + dir.col;

                if (isValidMove(newRow, newCol)) {
                    queue.push([...path, {row: newRow, col: newCol}]);
                }
            }

            await sleep(50);
        }
    }

    async function dfs() {
        const start = {
            row: parseInt(startCell.dataset.row),
            col: parseInt(startCell.dataset.col)
        };
        const end = {
            row: parseInt(endCell.dataset.row),
            col: parseInt(endCell.dataset.col)
        };

        const visited = new Set();
        const stack = [[start]];

        while (stack.length > 0) {
            const path = stack.pop();
            const current = path[path.length - 1];
            const key = `${current.row},${current.col}`;

            if (visited.has(key)) continue;
            visited.add(key);

            const cell = maze[current.row][current.col];
            if (cell !== startCell && cell !== endCell) {
                cell.classList.add('visited');
            }

            if (current.row === end.row && current.col === end.col) {
                await visualizePath(path);
                return;
            }

            const directions = [
                {row: 0, col: 1},   // right
                {row: 1, col: 0},   // down
                {row: 0, col: -1},  // left
                {row: -1, col: 0}   // up
            ];

            for (const dir of directions) {
                const newRow = current.row + dir.row;
                const newCol = current.col + dir.col;

                if (isValidMove(newRow, newCol)) {
                    stack.push([...path, {row: newRow, col: newCol}]);
                }
            }

            await sleep(50);
        }
    }

    function isValidMove(row, col) {
        return row >= 0 && row < GRID_SIZE &&
               col >= 0 && col < GRID_SIZE &&
               !maze[row][col].classList.contains('wall');
    }

    async function visualizePath(path) {
        for (let i = 1; i < path.length - 1; i++) {
            const {row, col} = path[i];
            maze[row][col].classList.add('path');
            await sleep(50);
        }
    }

    // Initialize maze
    createMaze();

    // Reset button handler
    document.getElementById('resetMaze').addEventListener('click', () => {
        startCell = null;
        endCell = null;
        isSettingStart = true;
        createMaze();
    });

    // Algorithm change handler
    document.getElementById('algorithm').addEventListener('change', () => {
        if (startCell && endCell) {
            clearPath();
            const algorithm = document.getElementById('algorithm').value;
            if (algorithm === 'bfs') {
                bfs();
            } else {
                dfs();
            }
        }
    });
});
