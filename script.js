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
    let isPathfinding = false;
    
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
                startCell.classList.add('start'); // Ensure start point is visible
                endCell.classList.add('end'); // Ensure end point is visible
                const algorithm = document.getElementById('algorithm').value;
                if (algorithm) { // Ensure an algorithm is selected
                    if (algorithm === 'bfs') {
                        bfs();
                    } else {
                        dfs();
                    }
                }
            }
        }
    }

    function clearPath() {
        document.querySelectorAll('.cell').forEach(cell => {
            if (!cell.classList.contains('wall')) {
                cell.className = 'cell'; // Reset all classes except walls
            }
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function bfs() {
        isPathfinding = true;
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

        while (queue.length > 0 && isPathfinding) {
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

                if (isValidMove(newRow, newCol) && !visited.has(`${newRow},${newCol}`)) {
                    queue.push([...path, {row: newRow, col: newCol}]);
                }
            }

            await sleep(50);
        }
    }

    async function dfs() {
        isPathfinding = true;
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

        while (stack.length > 0 && isPathfinding) {
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
                {row: -1, col: 0}, // up
                {row: 1, col: 0},  // down
                {row: 0, col: -1}, // left
                {row: 0, col: 1}   // right
            ];

            for (const dir of directions) {
                const newRow = current.row + dir.row;
                const newCol = current.col + dir.col;

                if (isValidMove(newRow, newCol) && !visited.has(`${newRow},${newCol}`)) {
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
            const cell = maze[row][col];
            cell.classList.remove('visited'); // Remove visited class if present
            cell.classList.add('path'); // Add path class for green highlight
            await sleep(50);
        }
    }

    // Initialize maze
    createMaze();

    // Reset button handler
    document.getElementById('resetMaze').addEventListener('click', () => {
        isPathfinding = false;
        startCell = null;
        endCell = null;
        isSettingStart = true;
        createMaze();
    });

    // Algorithm change handler
    document.getElementById('algorithm').addEventListener('change', () => {
        if (startCell && endCell) {
            clearPath();
            startCell.classList.add('start'); // Ensure start point is visible
            endCell.classList.add('end'); // Ensure end point is visible
            const algorithm = document.getElementById('algorithm').value;
            if (algorithm) { // Ensure an algorithm is selected
                if (algorithm === 'bfs') {
                    bfs();
                } else {
                    dfs();
                }
            }
        }
    });

    // Function to update algorithm explanation
    function updateAlgorithmExplanation() {
        const explanationBox = document.getElementById('algorithmExplanation');
        const algorithm = document.getElementById('algorithm').value;
        let explanation = '';

        if (algorithm === 'bfs') {
            explanation = 'Breadth-First Search (BFS) is an algorithm for traversing or searching tree or graph data structures. It starts at the tree root (or some arbitrary node of a graph, sometimes referred to as a "search key"), and explores the neighbor nodes at the present depth prior to moving on to the nodes at the next depth level. BFS uses a queue to keep track of the nodes that need to be explored. It is guaranteed to find the shortest path in an unweighted grid.';
        } else if (algorithm === 'dfs') {
            explanation = 'Depth-First Search (DFS) is an algorithm for traversing or searching tree or graph data structures. The algorithm starts at the root node (selecting some arbitrary node as the root node in the case of a graph) and explores as far as possible along each branch before backtracking. DFS uses a stack to keep track of the path it is currently exploring. It does not guarantee the shortest path, as it explores as far as possible before backtracking.';
        } else if (algorithm === 'aStar') {
            explanation = 'A* Search is an informed search algorithm that finds the shortest path to the goal. It uses a heuristic to estimate the cost of the cheapest path from the current node to the goal. A* combines the cost to reach the node and the estimated cost to the goal, making it both complete and optimal.';
        } else if (algorithm === 'dijkstra') {
            explanation = "Dijkstra's Algorithm is a graph search algorithm that finds the shortest path from a starting node to all other nodes in a weighted graph. It uses a priority queue to explore nodes in order of their distance from the start node, ensuring the shortest path is found.";
        } else if (algorithm === 'greedyBestFirstSearch') {
            explanation = 'Greedy Best-First Search is an algorithm that expands the most promising node chosen according to a specified rule. It uses a heuristic to estimate the cost to reach the goal, but unlike A*, it does not consider the cost to reach the node, which can lead to suboptimal paths.';
        }

        explanationBox.textContent = explanation;
    }

    // Call updateAlgorithmExplanation on algorithm change
    document.getElementById('algorithm').addEventListener('change', updateAlgorithmExplanation);

    // Initial call to set explanation
    updateAlgorithmExplanation();

    async function aStar() {
        const start = {
            row: parseInt(startCell.dataset.row),
            col: parseInt(startCell.dataset.col)
        };
        const end = {
            row: parseInt(endCell.dataset.row),
            col: parseInt(endCell.dataset.col)
        };

        const openSet = [start];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        gScore.set(`${start.row},${start.col}`, 0);
        fScore.set(`${start.row},${start.col}`, heuristic(start, end));

        while (openSet.length > 0) {
            openSet.sort((a, b) => fScore.get(`${a.row},${a.col}`) - fScore.get(`${b.row},${b.col}`));
            const current = openSet.shift();

            if (current.row === end.row && current.col === end.col) {
                await visualizePath(reconstructPath(cameFrom, current));
                return;
            }

            const key = `${current.row},${current.col}`;
            const cell = maze[current.row][current.col];
            if (cell !== startCell && cell !== endCell) {
                cell.classList.add('visited');
            }

            const directions = [
                {row: -1, col: 0}, // up
                {row: 1, col: 0},  // down
                {row: 0, col: -1}, // left
                {row: 0, col: 1}   // right
            ];

            for (const dir of directions) {
                const neighbor = {row: current.row + dir.row, col: current.col + dir.col};
                const neighborKey = `${neighbor.row},${neighbor.col}`;

                if (!isValidMove(neighbor.row, neighbor.col)) continue;

                const tentativeGScore = gScore.get(key) + 1;

                if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, end));

                    if (!openSet.some(n => n.row === neighbor.row && n.col === neighbor.col)) {
                        openSet.push(neighbor);
                    }
                }
            }

            await sleep(50);
        }
    }

    function heuristic(a, b) {
        return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    }

    function reconstructPath(cameFrom, current) {
        const totalPath = [current];
        while (cameFrom.has(`${current.row},${current.col}`)) {
            current = cameFrom.get(`${current.row},${current.col}`);
            totalPath.unshift(current);
        }
        return totalPath;
    }

    async function dijkstra() {
        const start = {
            row: parseInt(startCell.dataset.row),
            col: parseInt(startCell.dataset.col)
        };
        const end = {
            row: parseInt(endCell.dataset.row),
            col: parseInt(endCell.dataset.col)
        };

        const distances = new Map();
        const previous = new Map();
        const queue = [start];

        distances.set(`${start.row},${start.col}`, 0);

        while (queue.length > 0) {
            queue.sort((a, b) => distances.get(`${a.row},${a.col}`) - distances.get(`${b.row},${b.col}`));
            const current = queue.shift();

            if (current.row === end.row && current.col === end.col) {
                await visualizePath(reconstructPath(previous, current));
                return;
            }

            const key = `${current.row},${current.col}`;
            const cell = maze[current.row][current.col];
            if (cell !== startCell && cell !== endCell) {
                cell.classList.add('visited');
            }

            const directions = [
                {row: -1, col: 0}, // up
                {row: 1, col: 0},  // down
                {row: 0, col: -1}, // left
                {row: 0, col: 1}   // right
            ];

            for (const dir of directions) {
                const neighbor = {row: current.row + dir.row, col: current.col + dir.col};
                const neighborKey = `${neighbor.row},${neighbor.col}`;

                if (!isValidMove(neighbor.row, neighbor.col)) continue;

                const alt = distances.get(key) + 1;

                if (alt < (distances.get(neighborKey) || Infinity)) {
                    distances.set(neighborKey, alt);
                    previous.set(neighborKey, current);

                    if (!queue.some(n => n.row === neighbor.row && n.col === neighbor.col)) {
                        queue.push(neighbor);
                    }
                }
            }

            await sleep(50);
        }
    }

    async function greedyBestFirstSearch() {
        const start = {
            row: parseInt(startCell.dataset.row),
            col: parseInt(startCell.dataset.col)
        };
        const end = {
            row: parseInt(endCell.dataset.row),
            col: parseInt(endCell.dataset.col)
        };

        const openSet = [start];
        const cameFrom = new Map();

        while (openSet.length > 0) {
            openSet.sort((a, b) => heuristic(a, end) - heuristic(b, end));
            const current = openSet.shift();

            if (current.row === end.row && current.col === end.col) {
                await visualizePath(reconstructPath(cameFrom, current));
                return;
            }

            const key = `${current.row},${current.col}`;
            const cell = maze[current.row][current.col];
            if (cell !== startCell && cell !== endCell) {
                cell.classList.add('visited');
            }

            const directions = [
                {row: -1, col: 0}, // up
                {row: 1, col: 0},  // down
                {row: 0, col: -1}, // left
                {row: 0, col: 1}   // right
            ];

            for (const dir of directions) {
                const neighbor = {row: current.row + dir.row, col: current.col + dir.col};
                const neighborKey = `${neighbor.row},${neighbor.col}`;

                if (!isValidMove(neighbor.row, neighbor.col)) continue;

                if (!cameFrom.has(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    openSet.push(neighbor);
                }
            }

            await sleep(50);
        }
    }
});
