/**
 * @module folderPanel
 * @desc Implements the folder panel for subcircuit organization
 */

import { scopeList } from './circuit';
import simulationArea from './simulationArea';
import { scheduleBackup } from './data/backupCircuit';
import { generateId, showMessage } from './utils';
import { updateSimulationSet, updateCanvasSet } from './engine';

/**
 * Represents the DOM element for displaying the folder panel
 * @type {HTMLElement}
 */
let folderPanelContainer = null;

/**
 * Keeps track of whether a drag operation is in progress
 * @type {boolean}
 */
let dragInProgress = false;

/**
 * The subcircuit being dragged
 * @type {string}
 */
let draggedSubcircuitId = null;

/**
 * The folder element being dragged over
 * @type {HTMLElement}
 */
let draggedOverFolder = null;

/**
 * Creates a folder structure view from the scope's folder data
 * @param {Scope} scope - The circuit scope
 * @returns {HTMLElement} - The folder structure DOM element
 */
function createFolderStructure(scope) {
    console.log("Creating folder structure for scope:", scope);
    
    // Ensure we have a valid scope
    if (!scope) {
        console.error("Invalid scope provided to createFolderStructure");
        scope = globalScope;
        if (!scope) {
            throw new Error("Failed to get a valid scope");
        }
    }
    
    // Ensure folders array and subcircuitMap exist
    if (!scope.folders) {
        console.log("Initializing empty folders array");
        scope.folders = [];
    }
    
    if (!scope.subcircuitMap) {
        console.log("Initializing empty subcircuitMap");
        scope.subcircuitMap = {};
    }
    
    // Create container
    const container = document.createElement('div');
    container.className = 'folder-structure';
    
    // Create the root folder view
    const rootFolder = document.createElement('div');
    rootFolder.className = 'folder root-folder open';
    rootFolder.innerHTML = '<div class="folder-name"><i class="fa fa-folder-open"></i> Root</div>';
    
    // Create subcircuit container for the root folder
    const rootSubcircuits = document.createElement('div');
    rootSubcircuits.className = 'folder-subcircuits';
    rootSubcircuits.dataset.folderId = 'root';
    
    // Add drag and drop event listeners to root folder
    rootSubcircuits.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rootSubcircuits.classList.add('drag-over');
    });
    
    rootSubcircuits.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rootSubcircuits.classList.add('drag-over');
        draggedOverFolder = rootSubcircuits;
        
        // Set the drop effect to indicate a move operation
        e.dataTransfer.dropEffect = 'move';
    });
    
    rootSubcircuits.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rootSubcircuits.classList.remove('drag-over');
    });
    
    rootSubcircuits.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rootSubcircuits.classList.remove('drag-over');
        
        // Clear drag-over styling from all folder containers
        document.querySelectorAll('.folder-subcircuits').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        // Get the subcircuit ID from either global variable or dataTransfer
        const subcircuitId = draggedSubcircuitId || e.dataTransfer.getData('text/plain');
        
        if (subcircuitId) {
            console.log(`Dropping subcircuit ${subcircuitId} to root folder`);
            moveSubcircuitToFolder(subcircuitId, null, scope);
            draggedSubcircuitId = null;
        } else {
            console.warn("Drop event received but no subcircuit ID found");
        }
    });
    
    // Add subcircuits not in any folder to the root folder
    console.log("Adding subcircuits to root folder");
    let rootSubcircuitCount = 0;
    
    try {
        for (const subcircuitId in scopeList) {
            if (subcircuitId === scope.id) {
                continue; // Skip the current circuit
            }
            
            // Check if this subcircuit is not assigned to any folder
            const folderId = scope.subcircuitMap[subcircuitId];
            if (folderId === undefined || folderId === null) {
                console.log(`Adding subcircuit ${subcircuitId} to root folder`);
                const subcircuitElement = createSubcircuitElement(subcircuitId, scope);
                if (subcircuitElement) {
                    rootSubcircuits.appendChild(subcircuitElement);
                    rootSubcircuitCount++;
                }
            }
        }
        
        console.log(`Added ${rootSubcircuitCount} subcircuits to root folder`);
    } catch (error) {
        console.error("Error adding subcircuits to root folder:", error);
    }
    
    rootFolder.appendChild(rootSubcircuits);
    container.appendChild(rootFolder);
    
    // Build nested folders
    const folderElements = {};
    folderElements['root'] = rootFolder; // Store root folder element
    
    try {
        // First create all folder elements
        console.log("Creating folder elements");
        for (const folder of scope.folders) {
            if (!folder || !folder.id) {
                console.warn("Invalid folder found:", folder);
                continue;
            }
            
            console.log(`Creating folder element for ${folder.name} (${folder.id})`);
            const folderElement = document.createElement('div');
            folderElement.className = 'folder';
            folderElement.dataset.folderId = folder.id;
            
            // Create folder header
            const folderName = document.createElement('div');
            folderName.className = 'folder-name';
            folderName.innerHTML = `<i class="fa fa-folder"></i> ${folder.name}`;
            
            // Add click event to toggle folder
            folderName.addEventListener('click', () => {
                folderElement.classList.toggle('open');
                if (folderElement.classList.contains('open')) {
                    folderName.innerHTML = `<i class="fa fa-folder-open"></i> ${folder.name}`;
                } else {
                    folderName.innerHTML = `<i class="fa fa-folder"></i> ${folder.name}`;
                }
            });
            
            // Add context menu for folder
            folderName.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showFolderContextMenu(e, folder, scope);
            });
            
            folderElement.appendChild(folderName);
            
            // Create subcircuit container for the folder
            const folderSubcircuits = document.createElement('div');
            folderSubcircuits.className = 'folder-subcircuits';
            folderSubcircuits.dataset.folderId = folder.id;
            
            // Add drag and drop event listeners for this folder
            folderSubcircuits.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                folderSubcircuits.classList.add('drag-over');
            });
            
            folderSubcircuits.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                folderSubcircuits.classList.add('drag-over');
                draggedOverFolder = folderSubcircuits;
                
                // Set the drop effect to indicate a move operation
                e.dataTransfer.dropEffect = 'move';
            });
            
            folderSubcircuits.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                folderSubcircuits.classList.remove('drag-over');
            });
            
            folderSubcircuits.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                folderSubcircuits.classList.remove('drag-over');
                
                // Clear drag-over styling from all folder containers
                document.querySelectorAll('.folder-subcircuits').forEach(el => {
                    el.classList.remove('drag-over');
                });
                
                // Get the subcircuit ID from either global variable or dataTransfer
                const subcircuitId = draggedSubcircuitId || e.dataTransfer.getData('text/plain');
                
                if (subcircuitId) {
                    console.log(`Dropping subcircuit ${subcircuitId} to folder ${folder.id}`);
                    moveSubcircuitToFolder(subcircuitId, folder.id, scope);
                    draggedSubcircuitId = null;
                } else {
                    console.warn("Drop event received but no subcircuit ID found");
                }
            });
            
            // Add subcircuits in this folder
            let folderSubcircuitCount = 0;
            for (const subcircuitId in scope.subcircuitMap) {
                if (scope.subcircuitMap[subcircuitId] === folder.id) {
                    console.log(`Adding subcircuit ${subcircuitId} to folder ${folder.id}`);
                    const subcircuitElement = createSubcircuitElement(subcircuitId, scope);
                    if (subcircuitElement) {
                        folderSubcircuits.appendChild(subcircuitElement);
                        folderSubcircuitCount++;
                    }
                }
            }
            console.log(`Added ${folderSubcircuitCount} subcircuits to folder ${folder.id}`);
            
            folderElement.appendChild(folderSubcircuits);
            folderElements[folder.id] = folderElement;
        }
        
        // Then organize folders in hierarchy
        console.log("Organizing folder hierarchy");
        for (const folder of scope.folders) {
            if (!folder || !folder.id) {
                continue;
            }
            
            const parentId = folder.parentId;
            console.log(`Placing folder ${folder.id} with parent ${parentId}`);
            
            if (parentId && folderElements[parentId]) {
                // Find the subcircuits container of the parent folder
                const parentSubcircuits = folderElements[parentId].querySelector('.folder-subcircuits');
                if (parentSubcircuits) {
                    parentSubcircuits.appendChild(folderElements[folder.id]);
                    console.log(`Added folder ${folder.id} to parent folder ${parentId}`);
                } else {
                    console.warn(`Could not find subcircuits container for parent folder ${parentId}`);
                    rootSubcircuits.appendChild(folderElements[folder.id]);
                }
            } else {
                // Add to root if parent doesn't exist
                console.log(`Adding folder ${folder.id} to root (parent ${parentId} not found)`);
                rootSubcircuits.appendChild(folderElements[folder.id]);
            }
        }
    } catch (error) {
        console.error("Error building folder hierarchy:", error);
        const errorMsg = document.createElement('div');
        errorMsg.className = 'folder-error';
        errorMsg.textContent = 'Error building folder hierarchy: ' + error.message;
        container.appendChild(errorMsg);
    }
    
    return container;
}

/**
 * Creates a UI element for a subcircuit
 * @param {string} subcircuitId - The ID of the subcircuit
 * @param {Scope} scope - The circuit scope
 * @returns {HTMLElement} - The subcircuit DOM element
 */
function createSubcircuitElement(subcircuitId, scope) {
    console.log(`Creating subcircuit element for ID: ${subcircuitId}`);
    
    // Validate parameters
    if (!subcircuitId) {
        console.error("No subcircuit ID provided");
        return null;
    }
    
    try {
        // Get the subcircuit scope
        const subcircuitScope = scopeList[subcircuitId];
        if (!subcircuitScope) {
            console.warn(`Subcircuit with ID ${subcircuitId} not found in scopeList`);
            return null;
        }
        
        // Create the element
        const element = document.createElement('div');
        element.className = 'subcircuit-item';
        element.dataset.id = subcircuitId;
        element.dataset.name = subcircuitScope.name || `Subcircuit ${subcircuitId}`;
        element.draggable = true;
        
        // Add subcircuit name or placeholder if missing
        const subcircuitName = subcircuitScope.name || `Subcircuit ${subcircuitId}`;
        element.innerHTML = `<i class="fa fa-microchip"></i> ${subcircuitName}`;
        
        // Add drag and drop event listeners
        element.addEventListener('dragstart', (e) => {
            console.log(`Drag started for subcircuit ${subcircuitId}`);
            
            // Set the data being dragged
            e.dataTransfer.setData('text/plain', subcircuitId);
            e.dataTransfer.effectAllowed = 'move';
            
            // Store the dragged element ID in the global variable
            draggedSubcircuitId = subcircuitId;
            dragInProgress = true;
            
            // Add a class to style the dragged element
            element.classList.add('dragging');
            
            // Highlight possible drop targets
            highlightDropTargets(true);
            
            // Delay to ensure the dragging style is applied
            setTimeout(() => {
                element.classList.add('dragging');
            }, 0);
        });
        
        element.addEventListener('dragend', (e) => {
            console.log(`Drag ended for subcircuit ${subcircuitId}`);
            
            // Clean up
            dragInProgress = false;
            
            // Reset global variables
            console.log(`Resetting dragged subcircuit ID (was ${draggedSubcircuitId})`);
            draggedSubcircuitId = null;
            draggedOverFolder = null;
            
            // Remove the dragging style
            element.classList.remove('dragging');
            
            // Remove drop target highlighting
            highlightDropTargets(false);
            
            // Clear any drag-over styling
            document.querySelectorAll('.folder-subcircuits').forEach(el => {
                el.classList.remove('drag-over');
            });
            
            e.preventDefault();
        });
        
        // Add double click to open subcircuit
        element.addEventListener('dblclick', () => {
            console.log(`Double-clicked on subcircuit ${subcircuitId}, opening it`);
            switchToSubcircuit(subcircuitId);
        });
        
        // Add context menu
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            console.log(`Right-clicked on subcircuit ${subcircuitId}, showing context menu`);
            showSubcircuitContextMenu(e, subcircuitId, scope);
        });
        
        return element;
    } catch (error) {
        console.error(`Error creating subcircuit element for ${subcircuitId}:`, error);
        return null;
    }
}

/**
 * Shows a context menu for the subcircuit
 * @param {Event} e - The context menu event
 * @param {string} subcircuitId - The ID of the subcircuit
 * @param {Scope} scope - The circuit scope
 */
function showSubcircuitContextMenu(e, subcircuitId, scope) {
    // Remove any existing context menus
    removeContextMenus();
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu subcircuit-context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    
    const openMenuItem = document.createElement('div');
    openMenuItem.className = 'context-menu-item';
    openMenuItem.innerHTML = '<i class="fa fa-external-link"></i> Open';
    openMenuItem.addEventListener('click', () => {
        removeContextMenus();
        switchToSubcircuit(subcircuitId);
    });
    contextMenu.appendChild(openMenuItem);
    
    // Add move options
    const moveMenuItem = document.createElement('div');
    moveMenuItem.className = 'context-menu-item has-submenu';
    moveMenuItem.innerHTML = '<i class="fa fa-arrows"></i> Move to folder';
    
    const submenu = document.createElement('div');
    submenu.className = 'context-submenu';
    
    // Add root folder option
    const rootOption = document.createElement('div');
    rootOption.className = 'context-menu-item';
    rootOption.innerHTML = '<i class="fa fa-folder-open"></i> Root';
    rootOption.addEventListener('click', () => {
        removeContextMenus();
        moveSubcircuitToFolder(subcircuitId, null, scope);
    });
    submenu.appendChild(rootOption);
    
    // Add folder options
    for (let folder of scope.folders) {
        const folderOption = document.createElement('div');
        folderOption.className = 'context-menu-item';
        folderOption.innerHTML = `<i class="fa fa-folder"></i> ${folder.name}`;
        folderOption.addEventListener('click', () => {
            removeContextMenus();
            moveSubcircuitToFolder(subcircuitId, folder.id, scope);
        });
        submenu.appendChild(folderOption);
    }
    
    moveMenuItem.appendChild(submenu);
    contextMenu.appendChild(moveMenuItem);
    
    document.body.appendChild(contextMenu);
    
    // Add click outside event to remove the menu
    setTimeout(() => {
        document.addEventListener('click', removeContextMenus);
    }, 10);
}

/**
 * Shows a context menu for the folder
 * @param {Event} e - The context menu event
 * @param {Object} folder - The folder object
 * @param {Scope} scope - The circuit scope
 */
function showFolderContextMenu(e, folder, scope) {
    // Remove any existing context menus
    removeContextMenus();
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu folder-context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    
    const renameMenuItem = document.createElement('div');
    renameMenuItem.className = 'context-menu-item';
    renameMenuItem.innerHTML = '<i class="fa fa-pencil"></i> Rename';
    renameMenuItem.addEventListener('click', () => {
        removeContextMenus();
        renameFolder(folder, scope);
    });
    contextMenu.appendChild(renameMenuItem);
    
    const deleteMenuItem = document.createElement('div');
    deleteMenuItem.className = 'context-menu-item';
    deleteMenuItem.innerHTML = '<i class="fa fa-trash"></i> Delete';
    deleteMenuItem.addEventListener('click', () => {
        removeContextMenus();
        deleteFolder(folder, scope);
    });
    contextMenu.appendChild(deleteMenuItem);
    
    document.body.appendChild(contextMenu);
    
    // Add click outside event to remove the menu
    setTimeout(() => {
        document.addEventListener('click', removeContextMenus);
    }, 10);
}

/**
 * Removes all context menus from the DOM
 */
function removeContextMenus() {
    document.querySelectorAll('.context-menu').forEach(menu => {
        menu.remove();
    });
    document.removeEventListener('click', removeContextMenus);
}

/**
 * Switches the view to a subcircuit
 * @param {string} subcircuitId - The ID of the subcircuit to switch to
 */
function switchToSubcircuit(subcircuitId) {
    // Use the existing switchCircuit function if available
    if (typeof switchCircuit === 'function') {
        switchCircuit(subcircuitId);
    } else {
        // Fallback behavior
        const scope = scopeList[subcircuitId];
        if (scope) {
            window.globalScope = scope;
            updateSimulationSet(true);
            updateCanvasSet(true);
        }
    }
}

/**
 * Moves a subcircuit to a folder
 * @param {string} subcircuitId - The ID of the subcircuit
 * @param {string} folderId - The ID of the destination folder (null for root)
 * @param {Scope} scope - The circuit scope
 */
function moveSubcircuitToFolder(subcircuitId, folderId, scope) {
    console.log(`[moveSubcircuitToFolder] Moving subcircuit ${subcircuitId} to folder ${folderId || 'root'}`);
    
    // Validate parameters
    if (!subcircuitId) {
        console.error("[moveSubcircuitToFolder] No subcircuit ID provided");
        return;
    }
    
    // Make sure we have a valid scope
    if (!scope) {
        console.error("[moveSubcircuitToFolder] No scope provided, falling back to globalScope");
        scope = globalScope;
        if (!scope) {
            console.error("[moveSubcircuitToFolder] Failed to get a valid scope");
            return;
        }
    }
    
    try {
        // Make sure subcircuitMap exists
        if (!scope.subcircuitMap) {
            console.log("[moveSubcircuitToFolder] Creating subcircuitMap in scope");
            scope.subcircuitMap = {};
        }
        
        // Check if the subcircuit exists in scopeList
        if (!scopeList[subcircuitId]) {
            console.warn(`[moveSubcircuitToFolder] Subcircuit ${subcircuitId} not found in scopeList`);
            return;
        }
        
        // Get current folder (for logging purposes)
        const currentFolder = scope.subcircuitMap[subcircuitId] || "root";
        console.log(`[moveSubcircuitToFolder] Current folder for subcircuit ${subcircuitId} is ${currentFolder}`);
        
        // If target folder is the same as current folder, do nothing
        if (currentFolder === folderId) {
            console.log(`[moveSubcircuitToFolder] Subcircuit ${subcircuitId} is already in folder ${folderId || 'root'}`);
            return;
        }
        
        // Update the subcircuitMap
        if (folderId === null) {
            console.log(`[moveSubcircuitToFolder] Moving subcircuit ${subcircuitId} to root folder`);
            delete scope.subcircuitMap[subcircuitId];
        } else {
            // Verify that the folder exists
            const folderExists = scope.folders.some(folder => folder.id === folderId);
            if (!folderExists) {
                console.error(`[moveSubcircuitToFolder] Target folder ${folderId} does not exist`);
                return;
            }
            
            console.log(`[moveSubcircuitToFolder] Moving subcircuit ${subcircuitId} to folder ${folderId}`);
            scope.subcircuitMap[subcircuitId] = folderId;
        }
        
        // Update the UI
        console.log("[moveSubcircuitToFolder] Updating UI");
        renderFolderPanel(scope);
        
        // Schedule a backup to save changes
        console.log("[moveSubcircuitToFolder] Scheduling backup");
        scheduleBackup(scope);
        
        console.log(`[moveSubcircuitToFolder] Successfully moved subcircuit ${subcircuitId} to folder ${folderId || 'root'}`);
        showMessage(`Subcircuit moved to ${folderId ? 'folder' : 'root'} successfully`);
    } catch (error) {
        console.error("[moveSubcircuitToFolder] Error moving subcircuit:", error);
    }
}

/**
 * Renames a folder
 * @param {Object} folder - The folder object
 * @param {Scope} scope - The circuit scope
 */
function renameFolder(folder, scope) {
    const newName = prompt('Enter a new name for the folder:', folder.name);
    if (newName && newName.trim() !== '') {
        scope.renameFolder(folder.id, newName.trim());
        renderFolderPanel();
        scheduleBackup(scope);
    }
}

/**
 * Deletes a folder
 * @param {Object} folder - The folder object
 * @param {Scope} scope - The circuit scope
 */
function deleteFolder(folder, scope) {
    if (confirm(`Are you sure you want to delete the folder "${folder.name}"?`)) {
        scope.deleteFolder(folder.id);
        renderFolderPanel();
        scheduleBackup(scope);
    }
}

/**
 * Creates a new folder
 * @param {Scope} scope - The circuit scope
 * @param {string} parentId - The ID of the parent folder (null for root)
 */
function createNewFolder(scope, parentId = null) {
    console.log("Creating new folder, current scope:", scope);
    const folderName = prompt('Enter a name for the new folder:');
    console.log("Folder name entered:", folderName);
    
    if (folderName && folderName.trim() !== '') {
        try {
            // Check if scope is valid
            if (!scope) {
                console.error("Scope is undefined or null");
                scope = globalScope; // Fallback to global scope
            }
            
            // Check if the createFolder method exists
            if (typeof scope.createFolder !== 'function') {
                console.error("createFolder method not found on scope object", scope);
                alert("Error: Could not create folder due to missing functionality");
                return;
            }
            
            // Create the folder
            const folderId = scope.createFolder(folderName.trim(), parentId);
            console.log("Folder created with ID:", folderId);
            
            // Schedule a backup to save changes
            scheduleBackup(scope);
            
            // Update the UI
            renderFolderPanel(scope);
            
            // Show success message
            showMessage("Folder '" + folderName.trim() + "' created successfully");
        } catch (error) {
            console.error("Error creating folder:", error);
            alert("Error creating folder: " + error.message);
        }
    }
}

/**
 * Renders the folder panel
 * @param {Scope} scope - The circuit scope (uses globalScope if not provided)
 */
function renderFolderPanel(scope = globalScope) {
    console.log("Rendering folder panel, scope:", scope);
    
    if (!folderPanelContainer) {
        console.error("Folder panel container is not initialized");
        return;
    }
    
    // Check if scope is valid
    if (!scope) {
        console.error("Scope is undefined or null");
        scope = globalScope; // Fallback to global scope
    }
    
    // Ensure folders array exists
    if (!scope.folders) {
        console.log("Creating empty folders array for scope");
        scope.folders = [];
    }
    
    // Ensure subcircuitMap exists
    if (!scope.subcircuitMap) {
        console.log("Creating empty subcircuitMap for scope");
        scope.subcircuitMap = {};
    }
    
    // Clear existing content
    folderPanelContainer.innerHTML = '';
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'folder-panel-close';
    closeBtn.innerHTML = '&times; Close';
    closeBtn.addEventListener('click', toggleFolderPanel);
    folderPanelContainer.appendChild(closeBtn);
    
    // Add header
    const header = document.createElement('div');
    header.className = 'folder-panel-header';
    header.innerHTML = 'Subcircuit Folders';
    folderPanelContainer.appendChild(header);
    
    // Add action buttons
    const actions = document.createElement('div');
    actions.className = 'folder-panel-actions';
    
    const newFolderBtn = document.createElement('button');
    newFolderBtn.className = 'folder-panel-btn';
    newFolderBtn.innerHTML = '<i class="fa fa-folder-plus"></i> New Folder';
    
    // Make sure the click event correctly passes the scope
    newFolderBtn.addEventListener('click', function() {
        console.log("New folder button clicked");
        createNewFolder(scope);
    });
    
    actions.appendChild(newFolderBtn);
    folderPanelContainer.appendChild(actions);
    
    // Add folder structure
    try {
        const folderStructure = createFolderStructure(scope);
        folderPanelContainer.appendChild(folderStructure);
        console.log("Folder structure rendered successfully");
    } catch (error) {
        console.error("Error creating folder structure:", error);
        const errorMsg = document.createElement('div');
        errorMsg.className = 'folder-error';
        errorMsg.innerHTML = 'Error loading folders: ' + error.message;
        folderPanelContainer.appendChild(errorMsg);
    }
    
    console.log("Current folders:", scope.folders);
    console.log("Current subcircuitMap:", scope.subcircuitMap);
}

/**
 * Initializes the folder panel
 */
export function initFolderPanel() {
    console.log("Initializing folder panel");
    
    // Create folder panel container if it doesn't exist
    if (!document.getElementById('folderPanel')) {
        console.log("Creating folder panel container");
        folderPanelContainer = document.createElement('div');
        folderPanelContainer.id = 'folderPanel';
        folderPanelContainer.className = 'folder-panel';
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'folder-panel-close';
        closeBtn.innerHTML = '&times; Close';
        closeBtn.addEventListener('click', toggleFolderPanel);
        folderPanelContainer.appendChild(closeBtn);
        
        document.getElementById('simulation').appendChild(folderPanelContainer);
    } else {
        console.log("Folder panel container already exists");
        folderPanelContainer = document.getElementById('folderPanel');
    }
    
    // Add styles directly as a stylesheet element
    if (!document.getElementById('folderPanelStyles')) {
        console.log("Adding folder panel styles");
        const style = document.createElement('style');
        style.id = 'folderPanelStyles';
        style.innerHTML = `
            #folderPanel {
                position: absolute;
                right: 0;
                top: 0;
                width: 250px;
                height: 100%;
                background: #fff;
                border-left: 1px solid #ccc;
                z-index: 100;
                overflow-y: auto;
                transform: translateX(100%);
                transition: transform 0.3s ease;
                box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
            }
            #folderPanel.show {
                transform: translateX(0);
            }
            .folder-panel-header {
                padding: 10px;
                font-weight: bold;
                border-bottom: 1px solid #eee;
                text-align: center;
                margin-top: 30px;
            }
            .folder-panel-actions {
                padding: 10px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: center;
            }
            .folder-panel-btn {
                background: #4caf50;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 14px;
            }
            .folder-panel-btn:hover {
                background: #388e3c;
            }
            .folder-panel-close {
                position: fixed;
                top: 5px;
                right: 5px;
                background: #f44336;
                color: white;
                border: none;
                border-radius: 3px;
                padding: 5px 10px;
                font-size: 16px;
                cursor: pointer;
                z-index: 101;
                display: flex;
                align-items: center;
            }
            .folder-panel-close:hover {
                background: #d32f2f;
            }
            .folder-structure {
                padding: 10px;
            }
            .folder {
                margin-bottom: 5px;
                transition: all 0.2s ease;
            }
            .folder-name {
                padding: 5px;
                cursor: pointer;
                background: #f5f5f5;
                border-radius: 3px;
                transition: background 0.2s ease;
            }
            .folder-name:hover {
                background: #e0e0e0;
            }
            .folder-subcircuits {
                padding-left: 20px;
                display: block;
                border: 2px dashed transparent;
                border-radius: 3px;
                min-height: 10px;
                transition: all 0.2s ease;
            }
            .folder:not(.open) > .folder-subcircuits {
                display: none;
            }
            .folder-subcircuits.drag-over {
                border-color: #2196F3;
                background-color: rgba(33, 150, 243, 0.1);
                box-shadow: 0 0 5px rgba(33, 150, 243, 0.3);
            }
            .subcircuit-item {
                padding: 5px;
                margin: 2px 0;
                cursor: pointer;
                border-radius: 3px;
                background-color: #f9f9f9;
                border: 1px solid #e0e0e0;
                transition: all 0.2s ease;
            }
            .subcircuit-item:hover {
                background: #f0f0f0;
                border-color: #ccc;
            }
            .subcircuit-item.dragging {
                opacity: 0.5;
                background-color: #e3f2fd;
                border-color: #2196F3;
                transform: scale(0.98);
            }
            .context-menu {
                position: fixed;
                background: white;
                border: 1px solid #ccc;
                box-shadow: 3px 3px 5px rgba(0, 0, 0, 0.2);
                z-index: 1000;
            }
            .context-menu-item {
                padding: 8px 12px;
                cursor: pointer;
                position: relative;
            }
            .context-menu-item:hover {
                background: #f0f0f0;
            }
            .context-menu-item.has-submenu::after {
                content: "▶";
                position: absolute;
                right: 8px;
            }
            .context-submenu {
                position: absolute;
                left: 100%;
                top: 0;
                background: white;
                border: 1px solid #ccc;
                box-shadow: 3px 3px 5px rgba(0, 0, 0, 0.2);
                display: none;
            }
            .context-menu-item.has-submenu:hover .context-submenu {
                display: block;
            }
            #folderPanelToggle {
                position: fixed;
                left: 10px;
                bottom: 20px;
                padding: 8px 12px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                z-index: 99;
                display: flex;
                align-items: center;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                font-size: 14px;
                font-weight: bold;
            }
            #folderPanelToggle:hover {
                background: #1976D2;
            }
            .folder-error {
                padding: 10px;
                margin: 10px;
                background-color: #ffebee;
                border: 1px solid #ffcdd2;
                color: #b71c1c;
                border-radius: 3px;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Create toggle button if it doesn't exist
    if (!document.getElementById('folderPanelToggle')) {
        console.log("Creating folder panel toggle button");
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'folderPanelToggle';
        toggleBtn.innerHTML = '<i class="fa fa-folder"></i> Subcircuit Folders';
        toggleBtn.addEventListener('click', toggleFolderPanel);
        document.getElementById('simulation').appendChild(toggleBtn);
    }
    
    // Initialize with current scope
    console.log("Initializing folder panel with current scope");
    renderFolderPanel();
    
    // Set up automatic updates
    subscribeToCircuitEvents();
}

/**
 * Toggles the visibility of the folder panel
 */
export function toggleFolderPanel() {
    if (folderPanelContainer) {
        // Toggle the visibility class
        const isBeingShown = !folderPanelContainer.classList.contains('show');
        folderPanelContainer.classList.toggle('show');
        
        // Toggle the text on the button based on panel state
        const toggleBtn = document.getElementById('folderPanelToggle');
        if (toggleBtn) {
            if (folderPanelContainer.classList.contains('show')) {
                toggleBtn.innerHTML = '<i class="fa fa-folder"></i> Hide Folders';
            } else {
                toggleBtn.innerHTML = '<i class="fa fa-folder"></i> Subcircuit Folders';
            }
        }
        
        // Always refresh the panel content, especially when showing
        if (isBeingShown) {
            console.log("[folderPanel] Panel is being shown, refreshing content");
            // Slight delay to ensure the panel is visible before rendering
            setTimeout(() => {
                renderFolderPanel(globalScope);
            }, 50);
        } else {
            renderFolderPanel(globalScope);
        }
    }
}

/**
 * Updates the folder panel when the scope changes
 * @param {Scope} scope - The new circuit scope
 */
export function updateFolderPanel(scope = globalScope) {
    renderFolderPanel(scope);
}

/**
 * Subscribe to important circuit events to update folder panel automatically
 */
export function subscribeToCircuitEvents() {
    console.log("[folderPanel] Setting up auto-update event listeners");
    
    // Watch for changes to the scopeList object to detect new circuits
    if (window.scopeList) {
        // Keep track of the current number of scopes
        let lastScopeCount = Object.keys(window.scopeList).length;
        
        // Check periodically for new circuits
        setInterval(() => {
            const currentScopeCount = Object.keys(window.scopeList).length;
            if (currentScopeCount !== lastScopeCount) {
                console.log(`[folderPanel] Detected scope change: ${lastScopeCount} -> ${currentScopeCount}`);
                lastScopeCount = currentScopeCount;
                
                // Only update if the folder panel is visible
                if (folderPanelContainer && folderPanelContainer.classList.contains('show')) {
                    renderFolderPanel(globalScope);
                }
            }
        }, 1000); // Check every second
    }
    
    // Modify createSubCircuitPrompt to update folder panel
    if (typeof window.createSubCircuitPrompt === 'function') {
        const originalCreateSubCircuitPrompt = window.createSubCircuitPrompt;
        window.createSubCircuitPrompt = function(...args) {
            const result = originalCreateSubCircuitPrompt.apply(this, args);
            
            // Update folder panel after subcircuit creation dialog closes
            setTimeout(() => {
                if (folderPanelContainer && folderPanelContainer.classList.contains('show')) {
                    console.log("[folderPanel] Updating after subcircuit creation");
                    renderFolderPanel(globalScope);
                }
            }, 500);
            
            return result;
        };
        console.log("[folderPanel] Wrapped createSubCircuitPrompt function");
    }
    
    // Listen for subcircuit insertions
    document.addEventListener('subcircuitInserted', (e) => {
        console.log("[folderPanel] Subcircuit inserted event received");
        if (folderPanelContainer && folderPanelContainer.classList.contains('show')) {
            renderFolderPanel(globalScope);
        }
    });
    
    // Listen for clicks on the Insert SubCircuit menu option
    const subcircuitMenuItems = document.querySelectorAll('#createSubCircuitPrompt');
    subcircuitMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            console.log("[folderPanel] Subcircuit menu item clicked");
            setTimeout(() => {
                if (folderPanelContainer && folderPanelContainer.classList.contains('show')) {
                    renderFolderPanel(globalScope);
                }
            }, 1000);
        });
    });
}

/**
 * Highlights possible drop targets when drag is in progress
 * @param {boolean} isDragging - Whether dragging is in progress
 */
function highlightDropTargets(isDragging) {
    console.log(`Highlighting drop targets, dragging: ${isDragging}`);
    
    // Apply a class to the folder panel to indicate dragging is in progress
    if (folderPanelContainer) {
        if (isDragging) {
            folderPanelContainer.classList.add('dragging-in-progress');
        } else {
            folderPanelContainer.classList.remove('dragging-in-progress');
        }
    }
    
    // Add this style to show the drop targets more clearly
    if (!document.getElementById('dragDropStyles')) {
        const style = document.createElement('style');
        style.id = 'dragDropStyles';
        style.innerHTML = `
            .dragging-in-progress .folder-subcircuits {
                border-color: #ddd;
                min-height: 20px;
            }
            .dragging-in-progress .folder-subcircuits:hover {
                border-color: #2196F3;
                background-color: rgba(33, 150, 243, 0.05);
            }
        `;
        document.head.appendChild(style);
    }
} 