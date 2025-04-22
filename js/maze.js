/**
 * Optimized Maze Pathfinding Visualization
 * Performance-focused implementation with throttled operations
 */
document.addEventListener('DOMContentLoaded', function() {
    // Configuration constants
    const GRID_SIZE = 15;
    const WALL_PROBABILITY = 0.25;
    const ANIMATION_SPEED = 75; // Visualization speed (ms)
    
    // State management - centralized for better tracking
    const state = {
        startCell: null,
        endCell: null, 
        settingStart: true,
        pathfinding: false,
        animationInProgress: false,
        grid: [],
        lastOperation: Date.now(),
        throttleTime: 100, // ms to throttle user input
        currentAlgorithmRun: null // To track and potentially abort current algorithm
    };
    
    // DOM elements - cached for performance
    const elements = {
        mazeGrid: document.getElementById('mazeGrid'),
        resetButton: document.getElementById('resetMaze'),
        algorithmSelect: document.getElementById('algorithm'),
        explanationBox: document.getElementById('algorithmExplanation'),
        themeToggle: document.querySelector('.theme-toggle')
    };
    
    // Algorithm descriptions - defined once for memory efficiency
    const algorithmDescriptions = {
        bfs: 'Breadth-First Search (BFS) explores all neighbor nodes at the present depth before moving on to nodes at the next depth level. It uses a queue and is guaranteed to find the shortest path in an unweighted grid.',
        dfs: 'Depth-First Search (DFS) explores as far as possible along each branch before backtracking. It uses a stack and does not guarantee the shortest path.',
        aStar: 'A* Search combines the cost to reach the node and the estimated cost to the goal, making it both complete and optimal. It uses a heuristic to estimate the cheapest path.',
        dijkstra: "Dijkstra's Algorithm finds the shortest path from a starting node to all other nodes in a weighted graph. It uses a priority queue to explore nodes in order of their distance.",
        greedyBestFirstSearch: 'Greedy Best-First Search expands the most promising nodes according to a heuristic. Unlike A*, it does not consider the cost to reach the node, which can lead to suboptimal paths.'
    };
    
    // Directions array - defined once and reused across algorithms
    const DIRECTIONS = [
        [-1, 0],  // up
        [1, 0],   // down
        [0, -1],  // left
        [0, 1]    // right
    ];
    
    // Initialize theme
    initializeTheme();
    
    /**
     * Initialize and handle theme preferences
     */
    function initializeTheme() {
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Set initial theme based on preference or localStorage
        if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && prefersDarkScheme.matches)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (elements.themeToggle) {
                elements.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            }
        }

        // Theme toggle click handler
        if (elements.themeToggle) {
            elements.themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                if (currentTheme === 'dark') {
                    document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('theme', 'light');
                    elements.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
                } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                    elements.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
                }
                
                // Update maze colors for the new theme
                applyThemeToMaze();
            });
        }
        
        // Watch for theme changes
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'data-theme') {
                    applyThemeToMaze();
                }
            });
        });
        
        observer.observe(document.documentElement, { attributes: true });
    }
    
    /**
     * Create maze grid with walls
     */
    function createMaze() {
        if (!elements.mazeGrid) {
            console.error('Maze grid element not found');
            return;
        }
        
        // Reset state
        elements.mazeGrid.innerHTML = '';
        state.grid = [];
        state.startCell = null;
        state.endCell = null;
        state.settingStart = true;
        state.pathfinding = false;
        state.animationInProgress = false;
        state.currentAlgorithmRun = null;
        
        // Create grid with optimized event delegation
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < GRID_SIZE; i++) {
            const row = [];
            for (let j = 0; j < GRID_SIZE; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                
                // Add walls randomly with precalculated styles
                if (Math.random() < WALL_PROBABILITY) {
                    cell.className = 'cell wall';
                    cell.style.backgroundColor = '#1f2937';
                    cell.style.borderColor = '#111827';
                }
                
                fragment.appendChild(cell);
                row.push(cell);
            }
            state.grid.push(row);
        }
        
        // Single DOM insertion for better performance
        elements.mazeGrid.appendChild(fragment);
        
        // Add event delegation for better performance (single event listener)
        if (!elements.mazeGrid.hasEventListener) {
            elements.mazeGrid.addEventListener('click', handleCellClick);
            elements.mazeGrid.hasEventListener = true;
        }
        
        // Apply theme to walls 
        applyThemeToMaze();
    }

    /**
     * Handle cell click with throttling
     * @param {Event} event - The click event
     */
    function handleCellClick(event) {
        // Skip if pathfinding is running
        if (state.pathfinding || state.animationInProgress) {
            console.log('Ignoring click - pathfinding or animation in progress');
            return;
        }
        
        // Throttle clicks for better performance
        const now = Date.now();
        if (now - state.lastOperation < state.throttleTime) return;
        state.lastOperation = now;
        
        // Only proceed if clicking on a cell
        if (!event.target.classList.contains('cell')) return;
        
        const cell = event.target;
        
        // Skip if wall
        if (cell.classList.contains('wall')) return;
        
        // Stop any ongoing pathfinding and clear visualization
        stopPathfinding();
        
        if (state.settingStart) {
            // Setting start point
            if (state.startCell) {
                state.startCell.classList.remove('start');
                state.startCell.style.backgroundColor = '';
                state.startCell.style.boxShadow = '';
            }
            
            // Apply start styles
            cell.className = 'cell start';
            cell.style.backgroundColor = '#2563eb';
            cell.style.boxShadow = '0 0 10px #2563eb';
            state.startCell = cell;
            state.settingStart = false;
            
            console.log('Start cell set at', cell.dataset.row, cell.dataset.col);
        } else {
            // Setting end point
            if (state.endCell) {
                state.endCell.classList.remove('end');
                state.endCell.style.backgroundColor = '';
                state.endCell.style.boxShadow = '';
            }
            
            // Apply end styles
            cell.className = 'cell end';
            cell.style.backgroundColor = '#ef4444';
            cell.style.boxShadow = '0 0 10px #ef4444';
            state.endCell = cell;
            state.settingStart = true;
            
            console.log('End cell set at', cell.dataset.row, cell.dataset.col);
            
            // Run pathfinding with slight delay to allow UI to update
            setTimeout(() => {
                runPathfinding();
            }, 300);
        }
    }
    
    /**
     * Stop and clean up any running pathfinding algorithm
     */
    function stopPathfinding() {
        // Cancel any ongoing algorithm
        state.pathfinding = false;
        state.animationInProgress = false;
        
        // Reset visual states except walls and start/end
        document.querySelectorAll('.cell:not(.wall):not(.start):not(.end)').forEach(cell => {
            cell.classList.remove('visited', 'path');
            cell.style.backgroundColor = '';
            cell.style.boxShadow = '';
        });
        
        // Re-apply styles to start and end to make sure they're visible
        if (state.startCell) {
            state.startCell.className = 'cell start';
            state.startCell.style.backgroundColor = '#2563eb';
            state.startCell.style.boxShadow = '0 0 10px #2563eb';
        }
        
        if (state.endCell) {
            state.endCell.className = 'cell end';
            state.endCell.style.backgroundColor = '#ef4444';
            state.endCell.style.boxShadow = '0 0 10px #ef4444';
        }
    }
    
    /**
     * Run the selected pathfinding algorithm
     */
    function runPathfinding() {
        if (!state.startCell || !state.endCell) {
            console.log('Cannot run pathfinding - start or end not set');
            return;
        }
        
        // Don't start if already pathfinding
        if (state.pathfinding || state.animationInProgress) {
            console.log('Pathfinding already in progress');
            return;
        }
        
        // Ensure start and end points remain visible
        state.startCell.className = 'cell start';
        state.startCell.style.backgroundColor = '#2563eb';
        state.startCell.style.boxShadow = '0 0 10px #2563eb';
        
        state.endCell.className = 'cell end';
        state.endCell.style.backgroundColor = '#ef4444';
        state.endCell.style.boxShadow = '0 0 10px #ef4444';
        
        // Get the selected algorithm
        const algorithm = elements.algorithmSelect?.value || 'bfs';
        console.log('Running algorithm:', algorithm);
        
        // Set pathfinding flag
        state.pathfinding = true;
        
        // Run selected algorithm with error handling
        try {
            let algorithmPromise;
            
            switch (algorithm) {
                case 'bfs': 
                    algorithmPromise = bfs(); 
                    break;
                case 'dfs': 
                    algorithmPromise = dfs(); 
                    break;
                case 'aStar': 
                    algorithmPromise = aStar(); 
                    break;
                case 'dijkstra': 
                    algorithmPromise = dijkstra(); 
                    break;
                case 'greedyBestFirstSearch': 
                    algorithmPromise = greedyBestFirstSearch(); 
                    break;
                default: 
                    algorithmPromise = bfs();
            }
            
            // Set up error handling for the algorithm promise
            state.currentAlgorithmRun = algorithmPromise;
            
            algorithmPromise
                .catch(error => {
                    console.error('Pathfinding error:', error);
                    showMessage('An error occurred. Please try again.');
                })
                .finally(() => {
                    // Always reset state when algorithm completes or fails
                    state.pathfinding = false;
                    state.currentAlgorithmRun = null;
                    console.log('Algorithm completed or stopped');
                });
                
        } catch (error) {
            console.error('Error starting pathfinding:', error);
            showMessage('An error occurred. Please try again.');
            state.pathfinding = false;
        }
    }
    
    // ===== UTILITY FUNCTIONS =====
    
    /**
     * Pausable sleep function that can be interrupted
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise((resolve, reject) => {
            // Only resolve if pathfinding is still active
            if (state.pathfinding) {
                setTimeout(resolve, ms);
            } else {
                // If pathfinding was stopped, reject the promise
                reject(new Error('Pathfinding stopped'));
            }
        });
    }
    
    /**
     * Safe sleep function that doesn't throw if pathfinding is stopped
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    function safeSleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
    
    /**
     * Check if a move to the given coordinates is valid
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @returns {boolean} - True if the move is valid
     */
    function isValidMove(row, col) {
        return row >= 0 && row < GRID_SIZE &&
               col >= 0 && col < GRID_SIZE &&
               state.grid[row] && state.grid[row][col] &&
               !state.grid[row][col].classList.contains('wall');
    }
    
    /**
     * Calculate Manhattan distance between two points
     * @param {Object} a - First point {row, col}
     * @param {Object} b - Second point {row, col}
     * @returns {number} - Manhattan distance
     */
    function heuristic(a, b) {
        return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    }
    
    /**
     * Reconstruct path from a cameFrom map
     * @param {Map} cameFrom - Map of node to its predecessor
     * @param {Object} current - End node {row, col}
     * @returns {Array} - Array of nodes forming the path
     */
    function reconstructPath(cameFrom, current) {
        const totalPath = [current];
        let key = `${current.row},${current.col}`;
        
        while (cameFrom.has(key)) {
            current = cameFrom.get(key);
            key = `${current.row},${current.col}`;
            totalPath.unshift(current);
        }
        
        return totalPath;
    }
    
    /**
     * Visualize the found path
     * @param {Array} path - Array of nodes in the path
     * @returns {Promise<void>}
     */
    async function visualizePath(path) {
        if (!state.pathfinding) return;
        
        try {
            state.animationInProgress = true;
            
            // Skip start and end cells
            for (let i = 1; i < path.length - 1; i++) {
                if (!state.pathfinding) break;
                
                const {row, col} = path[i];
                const cell = state.grid[row][col];
                
                if (cell) {
                    cell.className = 'cell path';
                    cell.style.backgroundColor = '#10b981';
                    cell.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
                    
                    // Ensure each step is visible
                    await safeSleep(ANIMATION_SPEED);
                }
            }
        } catch (error) {
            console.error('Path visualization error:', error);
        } finally {
            state.animationInProgress = false;
        }
    }
    
    /**
     * Mark a cell as visited with animation
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @returns {Promise<boolean>} - True if the cell was marked
     */
    async function markVisited(row, col) {
        if (!state.pathfinding) return false;
        
        const cell = state.grid[row]?.[col];
        
        if (cell && cell !== state.startCell && cell !== state.endCell) {
            cell.classList.add('visited');
            cell.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
            cell.style.transition = 'background-color 0.2s ease';
            
            // Always sleep a bit to slow down visualization
            await safeSleep(ANIMATION_SPEED / 2);
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Show a message to the user
     * @param {string} text - Message text
     */
    function showMessage(text) {
        const existingMessage = document.querySelector('.wall-message');
        if (existingMessage) existingMessage.remove();
        
        const message = document.createElement('div');
        message.className = 'wall-message';
        message.textContent = text;
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #ff9800;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            animation: fadeOut 4s linear forwards;
        `;
        
        document.body.appendChild(message);
        
        // Add animation if not already added
        if (!document.getElementById('fadeout-animation')) {
            const style = document.createElement('style');
            style.id = 'fadeout-animation';
            style.textContent = `
                @keyframes fadeOut {
                    0% { opacity: 1; }
                    20% { opacity: 0.9; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 4000);
    }
    
    /**
     * Update the algorithm explanation text
     */
    function updateAlgorithmExplanation() {
        if (!elements.explanationBox) return;
        
        const algorithm = elements.algorithmSelect?.value || 'bfs';
        elements.explanationBox.textContent = algorithmDescriptions[algorithm] || '';
    }
    
    // ===== PATHFINDING ALGORITHMS =====
    
    /**
     * Breadth-First Search implementation
     * @returns {Promise<void>}
     */
    async function bfs() {
        if (!state.startCell || !state.endCell || !state.pathfinding) return;
        
        const start = {
            row: parseInt(state.startCell.dataset.row),
            col: parseInt(state.startCell.dataset.col)
        };
        
        const end = {
            row: parseInt(state.endCell.dataset.row),
            col: parseInt(state.endCell.dataset.col)
        };
        
        // Use array as queue for simplicity
        const queue = [];
        queue.push([start]);
        
        // Use Set for O(1) lookups
        const visited = new Set();
        
        try {
            while (queue.length > 0 && state.pathfinding) {
                const path = queue.shift(); // dequeue
                const current = path[path.length - 1];
                const key = `${current.row},${current.col}`;
                
                if (visited.has(key)) continue;
                visited.add(key);
                
                // Check for destination
                if (current.row === end.row && current.col === end.col) {
                    await visualizePath(path);
                    return;
                }
                
                // Mark as visited with visualization
                await markVisited(current.row, current.col);
                
                // Check all four directions (optimized with constant array)
                for (const [dx, dy] of DIRECTIONS) {
                    const newRow = current.row + dx;
                    const newCol = current.col + dy;
                    const newKey = `${newRow},${newCol}`;
                    
                    if (isValidMove(newRow, newCol) && !visited.has(newKey)) {
                        queue.push([...path, {row: newRow, col: newCol}]);
                    }
                }
            }
            
            // If we get here, no path was found
            if (state.pathfinding) {
                showMessage('No path found. The end is unreachable.');
            }
        } catch (error) {
            console.error('BFS error:', error);
            throw error;
        }
    }
    
    /**
     * Depth-First Search implementation
     * @returns {Promise<void>}
     */
    async function dfs() {
        if (!state.startCell || !state.endCell || !state.pathfinding) return;
        
        const start = {
            row: parseInt(state.startCell.dataset.row),
            col: parseInt(state.startCell.dataset.col)
        };
        
        const end = {
            row: parseInt(state.endCell.dataset.row),
            col: parseInt(state.endCell.dataset.col)
        };
        
        // Use array as stack
        const stack = [];
        stack.push([start]);
        
        // Track visited nodes
        const visited = new Set();
        
        try {
            while (stack.length > 0 && state.pathfinding) {
                const path = stack.pop(); // pop for LIFO
                const current = path[path.length - 1];
                const key = `${current.row},${current.col}`;
                
                if (visited.has(key)) continue;
                visited.add(key);
                
                // Check for destination
                if (current.row === end.row && current.col === end.col) {
                    await visualizePath(path);
                    return;
                }
                
                // Mark as visited
                await markVisited(current.row, current.col);
                
                // Explore in reverse order for DFS effect
                for (let i = DIRECTIONS.length - 1; i >= 0; i--) {
                    const [dx, dy] = DIRECTIONS[i];
                    const newRow = current.row + dx;
                    const newCol = current.col + dy;
                    const newKey = `${newRow},${newCol}`;
                    
                    if (isValidMove(newRow, newCol) && !visited.has(newKey)) {
                        stack.push([...path, {row: newRow, col: newCol}]);
                    }
                }
            }
            
            // No path found
            if (state.pathfinding) {
                showMessage('No path found. The end is unreachable.');
            }
        } catch (error) {
            console.error('DFS error:', error);
            throw error;
        }
    }
    
    /**
     * A* Search Algorithm implementation
     * @returns {Promise<void>}
     */
    async function aStar() {
        if (!state.startCell || !state.endCell || !state.pathfinding) return;
        
        const start = {
            row: parseInt(state.startCell.dataset.row),
            col: parseInt(state.startCell.dataset.col)
        };
        
        const end = {
            row: parseInt(state.endCell.dataset.row),
            col: parseInt(state.endCell.dataset.col)
        };
        
        // A* data structures
        const openSet = [start];               // Nodes to explore
        const cameFrom = new Map();            // Path tracking
        const gScore = new Map();              // Cost from start to node
        const fScore = new Map();              // Estimated total cost
        const closedSet = new Set();           // Fully explored nodes
        
        // Set initial costs
        const startKey = `${start.row},${start.col}`;
        gScore.set(startKey, 0);
        fScore.set(startKey, heuristic(start, end));
        
        try {
            while (openSet.length > 0 && state.pathfinding) {
                // Sort open set by fScore (lowest first)
                openSet.sort((a, b) => {
                    const aKey = `${a.row},${a.col}`;
                    const bKey = `${b.row},${b.col}`;
                    return (fScore.get(aKey) || Infinity) - (fScore.get(bKey) || Infinity);
                });
                
                // Get node with lowest fScore
                const current = openSet.shift();
                const currentKey = `${current.row},${current.col}`;
                
                // Check if we've reached the destination
                if (current.row === end.row && current.col === end.col) {
                    // Reconstruct and visualize path
                    const path = [];
                    let curr = current;
                    while (curr) {
                        path.unshift(curr);
                        const key = `${curr.row},${curr.col}`;
                        curr = cameFrom.get(key);
                    }
                    await visualizePath(path);
                    return;
                }
                
                // Mark as processed
                closedSet.add(currentKey);
                await markVisited(current.row, current.col);
                
                // Explore all neighbors
                for (const [dx, dy] of DIRECTIONS) {
                    const neighbor = {
                        row: current.row + dx,
                        col: current.col + dy
                    };
                    const neighborKey = `${neighbor.row},${neighbor.col}`;
                    
                    // Skip invalid or closed nodes
                    if (!isValidMove(neighbor.row, neighbor.col) || closedSet.has(neighborKey)) {
                        continue;
                    }
                    
                    // Calculate tentative cost to this neighbor
                    const tentativeGScore = gScore.get(currentKey) + 1;
                    
                    // Find if neighbor is in open set
                    const inOpenSet = openSet.some(n => 
                        n.row === neighbor.row && n.col === neighbor.col);
                    
                    // Update path if better
                    if (!inOpenSet || tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
                        // This path is better than previous ones
                        cameFrom.set(neighborKey, current);
                        gScore.set(neighborKey, tentativeGScore);
                        fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, end));
                        
                        // Add to open set if not already there
                        if (!inOpenSet) {
                            openSet.push(neighbor);
                        }
                    }
                }
            }
            
            // No path found
            if (state.pathfinding) {
                showMessage('No path found. The end is unreachable.');
            }
        } catch (error) {
            console.error('A* error:', error);
            throw error;
        }
    }
    
    /**
     * Dijkstra's Algorithm implementation
     * @returns {Promise<void>}
     */
    async function dijkstra() {
        if (!state.startCell || !state.endCell || !state.pathfinding) return;
        
        const start = {
            row: parseInt(state.startCell.dataset.row),
            col: parseInt(state.startCell.dataset.col)
        };
        
        const end = {
            row: parseInt(state.endCell.dataset.row),
            col: parseInt(state.endCell.dataset.col)
        };
        
        // Dijkstra's algorithm data structures
        const queue = [];                   // Priority queue by distance
        const visited = new Set();          // Set of visited nodes
        const distances = new Map();        // Distances from start
        const previous = new Map();         // Previous node in path
        
        // Initialize with start node
        queue.push(start);
        distances.set(`${start.row},${start.col}`, 0);
        
        try {
            while (queue.length > 0 && state.pathfinding) {
                // Sort queue by distance (lowest first)
                queue.sort((a, b) => {
                    const aKey = `${a.row},${a.col}`;
                    const bKey = `${b.row},${b.col}`;
                    return (distances.get(aKey) || Infinity) - (distances.get(bKey) || Infinity);
                });
                
                // Get closest node
                const current = queue.shift();
                const currentKey = `${current.row},${current.col}`;
                
                // Skip if already processed
                if (visited.has(currentKey)) continue;
                
                // Check if reached destination
                if (current.row === end.row && current.col === end.col) {
                    // Reconstruct path
                    const path = [];
                    let curr = current;
                    while (curr) {
                        path.unshift(curr);
                        curr = previous.get(`${curr.row},${curr.col}`);
                    }
                    await visualizePath(path);
                    return;
                }
                
                // Mark as visited
                visited.add(currentKey);
                await markVisited(current.row, current.col);
                
                // Current distance
                const currentDist = distances.get(currentKey) || 0;
                
                // Check all neighbors
                for (const [dx, dy] of DIRECTIONS) {
                    const neighborRow = current.row + dx;
                    const neighborCol = current.col + dy;
                    
                    // Skip invalid or already visited cells
                    if (!isValidMove(neighborRow, neighborCol)) continue;
                    
                    const neighborKey = `${neighborRow},${neighborCol}`;
                    if (visited.has(neighborKey)) continue;
                    
                    // Calculate new distance (all edges have weight 1)
                    const newDist = currentDist + 1;
                    
                    // Update if shorter path found
                    if (newDist < (distances.get(neighborKey) || Infinity)) {
                        distances.set(neighborKey, newDist);
                        previous.set(neighborKey, current);
                        
                        // Add to queue if not already there
                        const inQueue = queue.some(node => 
                            node.row === neighborRow && node.col === neighborCol);
                            
                        if (!inQueue) {
                            queue.push({row: neighborRow, col: neighborCol});
                        }
                    }
                }
            }
            
            // No path found
            if (state.pathfinding) {
                showMessage('No path found. The end is unreachable.');
            }
        } catch (error) {
            console.error('Dijkstra error:', error);
            throw error;
        }
    }
    
    /**
     * Greedy Best-First Search implementation
     * @returns {Promise<void>}
     */
    async function greedyBestFirstSearch() {
        if (!state.startCell || !state.endCell || !state.pathfinding) return;
        
        const start = {
            row: parseInt(state.startCell.dataset.row),
            col: parseInt(state.startCell.dataset.col)
        };
        
        const end = {
            row: parseInt(state.endCell.dataset.row),
            col: parseInt(state.endCell.dataset.col)
        };
        
        // Data structures
        const openSet = [start];         // Nodes to explore
        const cameFrom = new Map();      // Path tracking
        const visited = new Set();       // Visited nodes
        
        try {
            while (openSet.length > 0 && state.pathfinding) {
                // Sort by heuristic only (no path cost considered)
                openSet.sort((a, b) => heuristic(a, end) - heuristic(b, end));
                
                // Get best node
                const current = openSet.shift();
                const currentKey = `${current.row},${current.col}`;
                
                // Skip if already processed
                if (visited.has(currentKey)) continue;
                visited.add(currentKey);
                
                // Check if we've reached the goal
                if (current.row === end.row && current.col === end.col) {
                    // Reconstruct path
                    const path = [];
                    let curr = current;
                    while (curr) {
                        path.unshift(curr);
                        const key = `${curr.row},${curr.col}`;
                        curr = cameFrom.get(key);
                    }
                    await visualizePath(path);
                    return;
                }
                
                // Mark as visited
                await markVisited(current.row, current.col);
                
                // Explore all neighbors
                for (const [dx, dy] of DIRECTIONS) {
                    const neighbor = {
                        row: current.row + dx,
                        col: current.col + dy
                    };
                    const neighborKey = `${neighbor.row},${neighbor.col}`;
                    
                    // Skip invalid or visited
                    if (!isValidMove(neighbor.row, neighbor.col) || visited.has(neighborKey)) {
                        continue;
                    }
                    
                    // Track path
                    if (!cameFrom.has(neighborKey)) {
                        cameFrom.set(neighborKey, current);
                        openSet.push(neighbor);
                    }
                }
            }
            
            // No path found
            if (state.pathfinding) {
                showMessage('No path found. The end is unreachable.');
            }
        } catch (error) {
            console.error('Greedy Best-First error:', error);
            throw error;
        }
    }
    
    /**
     * Apply the current theme to the maze elements
     */
    function applyThemeToMaze() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const walls = document.querySelectorAll('.cell.wall');
        
        walls.forEach(wall => {
            if (currentTheme === 'dark') {
                // White walls for dark mode
                wall.style.backgroundColor = '#ffffff';
                wall.style.borderColor = '#f3f4f6';
                wall.style.boxShadow = '0 0 3px rgba(255, 255, 255, 0.5)';
            } else {
                // Original wall styling for light mode
                wall.style.backgroundColor = '#1f2937';
                wall.style.borderColor = '#111827';
                wall.style.boxShadow = 'none';
            }
        });
    }
    
    /**
     * Set up smooth scrolling for navigation links
     */
    function setupSmoothScrolling() {
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
    }
    
    /**
     * Set up intersection observers for fade-in animations
     */
    function setupAnimationObservers() {
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
    }
    
    /**
     * Set up event listeners for user interaction
     */
    function setupEventListeners() {
        // Reset button handler
        if (elements.resetButton) {
            elements.resetButton.addEventListener('click', () => {
                stopPathfinding();
                createMaze();
            });
        }
        
        // Algorithm selection handler
        if (elements.algorithmSelect) {
            elements.algorithmSelect.addEventListener('change', () => {
                updateAlgorithmExplanation();
                
                // Run pathfinding if start and end are set
                if (state.startCell && state.endCell) {
                    stopPathfinding();
                    setTimeout(() => {
                        runPathfinding();
                    }, 100);
                }
            });
        }
    }
    
    /**
     * Initialize the application
     */
    function init() {
        setupSmoothScrolling();
        setupAnimationObservers();
        createMaze();
        updateAlgorithmExplanation();
        setupEventListeners();
        console.log('Maze visualization initialized');
    }
    
    // Debug utilities (accessible via console)
    window.debugMaze = () => {
        console.log('Maze Debug Info:');
        console.log('- Grid Size:', GRID_SIZE);
        console.log('- Wall Probability:', WALL_PROBABILITY);
        console.log('- Start Cell:', state.startCell ? `[${state.startCell.dataset.row},${state.startCell.dataset.col}]` : 'Not set');
        console.log('- End Cell:', state.endCell ? `[${state.endCell.dataset.row},${state.endCell.dataset.col}]` : 'Not set');
        console.log('- Setting Start:', state.settingStart);
        console.log('- Pathfinding Active:', state.pathfinding);
        console.log('- Animation In Progress:', state.animationInProgress);
        console.log('- Current Algorithm:', elements.algorithmSelect?.value || 'None');
        console.log('- Wall Count:', document.querySelectorAll('.cell.wall').length);
        
        return 'Debug info logged';
    };
    
    window.resetMazeEmergency = () => {
        stopPathfinding();
        createMaze();
        console.log('Emergency maze reset complete');
        return 'Maze reset';
    };
    
    // Global theme toggle function that can be used across all pages
    window.setupThemeToggle = function() {
        console.log("Theme toggle setup starting...");
        const themeToggle = document.querySelector('.theme-toggle');
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Debug output
        console.log("Found theme toggle button:", !!themeToggle);
        
        // Initialize theme
        if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && prefersDarkScheme.matches)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (themeToggle) {
                themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            }
        }
    
        // Theme toggle click handler
        if (themeToggle) {
            // Remove any existing event listeners to prevent duplicates
            const newThemeToggle = themeToggle.cloneNode(true);
            themeToggle.parentNode.replaceChild(newThemeToggle, themeToggle);
            
            newThemeToggle.addEventListener('click', function() {
                console.log("Theme toggle clicked!");
                const currentTheme = document.documentElement.getAttribute('data-theme');
                if (currentTheme === 'dark') {
                    document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('theme', 'light');
                    newThemeToggle.innerHTML = '<i class="fas fa-moon"></i>';
                } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                    newThemeToggle.innerHTML = '<i class="fas fa-sun"></i>';
                }
            });
            console.log("Theme toggle event listener attached");
        }
    };
    
    /**
     * Toggle between light and dark theme
     */
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Update maze appearance when theme changes
        applyThemeToMaze();
    }
    
    // Start the application
    init();
}); 