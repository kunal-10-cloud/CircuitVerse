/* eslint-disable import/no-cycle */
import { resetScopeList, newCircuit, switchCircuit } from '../circuit';
import { setProjectName } from './save';
import {
    scheduleUpdate, update, updateSimulationSet, updateCanvasSet, gridUpdateSet,
} from '../engine';
import { updateRestrictedElementsInScope } from '../restrictedElementDiv';
import simulationArea, { changeClockTime } from '../simulationArea';

import { loadSubCircuit } from '../subcircuit';
import { scheduleBackup } from './backupCircuit';
import { showProperties } from '../ux';
import { constructNodeConnections, loadNode, replace } from '../node';
import { generateId } from '../utils';
import modules from '../modules';
import { oppositeDirection } from '../canvasApi';
import plotArea from '../plotArea';
import { updateTestbenchUI, TestbenchData } from '../testbench';

/**
 * Backward compatibility - needs to be deprecated
 * @param {CircuitElement} obj - the object to be rectified
 * @category data
 */
function rectifyObjectType(obj) {
    const rectify = {
        FlipFlop: 'DflipFlop',
        Ram: 'Rom',
    };
    return rectify[obj] || obj;
}

/**
 * Function to load CircuitElements
 * @param {JSON} data - JSOn data
 * @param {Scope} scope - circuit in which we want to load modules
 * @category data
 */
function loadModule(data, scope) {
    // Create circuit element
    var obj = new modules[rectifyObjectType(data.objectType)](data.x, data.y, scope, ...data.customData.constructorParamaters || []);
    // Sets directions
    obj.label = data.label;
    obj.labelDirection = data.labelDirection || oppositeDirection[fixDirection[obj.direction]];

    // Sets delay
    if (data.propagationDelay === 0) {
        obj.propagationDelay = 0;
    } else {
        obj.propagationDelay = data.propagationDelay || obj.propagationDelay;
    }
    obj.fixDirection();

    // Restore other values
    if (data.customData.values) {
        Object.keys(data.customData.values).forEach((prop) => {
            if (Object.prototype.hasOwnProperty.call(data.customData.values, prop)) {
                obj[prop] = data.customData.values[prop];
            }
        });
    }

    // Replace new nodes with the correct old nodes (with connections)
    if (data.customData.nodes) {
        Object.keys(data.customData.nodes).forEach((node) => {
            if (Object.prototype.hasOwnProperty.call(data.customData.nodes, node)) {
                const n = data.customData.nodes[node];
                if (n instanceof Array) {
                    for (let i = 0; i < n.length; i++) {
                        obj[node][i] = replace(obj[node][i], n[i]);
                    }
                } else {
                    obj[node] = replace(obj[node], n);
                }
            }
        });
    }
    if (data.subcircuitMetadata) obj.subcircuitMetadata = data.subcircuitMetadata;
}

/**
 * This function shouldn't ideally exist. But temporary fix
 * for some issues while loading nodes.
 * @category data
 */
function removeBugNodes(scope = globalScope) {
    let x = scope.allNodes.length;
    for (let i = 0; i < x; i++) {
        if (scope.allNodes[i].type !== 2 && scope.allNodes[i].parent.objectType === 'CircuitElement') { scope.allNodes[i].delete(); }
        if (scope.allNodes.length !== x) {
            i = 0;
            x = scope.allNodes.length;
        }
    }
}

/**
 * Function to load a full circuit
 * @param {Scope} scope
 * @param {JSON} data
 * @category data
 */
export function loadScope(scope, data) {
    const ML = moduleList.slice(); // Module List copy
    const newScope = {
        ...scope,
        restrictedCircuitElementsUsed: data.restrictedCircuitElementsUsed,
    };

    // Load all nodes
    data.allNodes.forEach((x) => loadNode(x, newScope));

    // Make all connections
    for (let i = 0; i < data.allNodes.length; i++) { constructNodeConnections(newScope.allNodes[i], data.allNodes[i]); }
    // Load all modules
    for (let i = 0; i < ML.length; i++) {
        if (data[ML[i]]) {
            if (ML[i] === 'SubCircuit') {
                // Load subcircuits differently
                for (let j = 0; j < data[ML[i]].length; j++) { loadSubCircuit(data[ML[i]][j], newScope); }
            } else {
                // Load everything else similarly
                for (let j = 0; j < data[ML[i]].length; j++) {
                    loadModule(data[ML[i]][j], newScope);
                }
            }
        }
    }
    // Update wires according
    newScope.wires.forEach((x) => {
        x.updateData(newScope);
    });
    removeBugNodes(newScope); // To be deprecated

    // If Verilog Circuit Metadata exists, then restore
    if (data.verilogMetadata) {
        Object.assign(newScope, { verilogMetadata: data.verilogMetadata });
    }

    // If Test exists, then restore
    if (data.testbenchData) {
        Object.assign(newScope, {
            testbenchData: new TestbenchData(
                data.testbenchData.testData,
                data.testbenchData.currentGroup,
                data.testbenchData.currentCase,
            ),
        });
    }

    // If layout exists, then restore
    if (data.layout) {
        Object.assign(newScope, { layout: data.layout });
    } else {
        // Else generate new layout according to how it would have been otherwise (backward compatibility)
        const newLayout = {
            width: 100,
            height: Math.max(newScope.Input.length, newScope.Output.length) * 20 + 20,
            title_x: 50,
            title_y: 13,
        };
        Object.assign(newScope, { layout: newLayout });

        const inputLayouts = newScope.Input.map((input, i) => ({
            ...input,
            layoutProperties: {
                x: 0,
                y: newScope.layout.height / 2 - newScope.Input.length * 10 + 20 * i + 10,
                id: generateId(),
            },
        }));
        const outputLayouts = newScope.Output.map((output, i) => ({
            ...output,
            layoutProperties: {
                x: newScope.layout.width,
                y: newScope.layout.height / 2 - newScope.Output.length * 10 + 20 * i + 10,
                id: generateId(),
            },
        }));
        Object.assign(newScope, { Input: inputLayouts, Output: outputLayouts });
    }
    // Backward compatibility
    if (newScope.layout.titleEnabled === undefined) {
        Object.assign(newScope, { layout: { ...newScope.layout, titleEnabled: true } });
    }

    return newScope;
}

// Function to load project from data
/**
 * loads a saved project
 * @param {JSON} data - the json data of the
 * @category data
 * @exports load
 */
export default function load(data) {
    // If project is new and no data is there, then just set project name
    if (!data) {
        setProjectName(__projectName);
        return;
    }

    var { projectId } = data;
    setProjectName(data.name);

    globalScope = undefined;
    resetScopeList(); // Remove default scope
    $('.circuits').remove(); // Delete default scope

    // Load all  according to the dependency order
    for (let i = 0; i < data.scopes.length; i++) {
        var isVerilogCircuit = false;
        var isMainCircuit = false;
        if (data.scopes[i].verilogMetadata) {
            isVerilogCircuit = data.scopes[i].verilogMetadata.isVerilogCircuit;
            isMainCircuit = data.scopes[i].verilogMetadata.isMainCircuit;
        }
        // Create new circuit
        const scope = newCircuit(data.scopes[i].name || 'Untitled', data.scopes[i].id, isVerilogCircuit, isMainCircuit);

        // Load circuit data
        loadScope(scope, data.scopes[i]);

        // Focus circuit
        globalScope = scope;

        // Center circuit
        if (embed) { globalScope.centerFocus(true); } else { globalScope.centerFocus(false); }

        // update and backup circuit once
        update(globalScope, true);

        // Updating restricted element list initially on loading
        updateRestrictedElementsInScope();

        scheduleBackup();
    }

    // Restore clock
    changeClockTime(data.timePeriod || 500);
    simulationArea.clockEnabled = data.clockEnabled === undefined ? true : data.clockEnabled;

    if (!embed) { showProperties(simulationArea.lastSelected); }

    // Reorder tabs according to the saved order
    if (data.orderedTabs) {
        const unorderedTabs = $('.circuits').detach();
        const plusButton = $('#tabsBar').children().detach();
        data.orderedTabs.forEach((tab) => {
            $('#tabsBar').append(unorderedTabs.filter(`#${tab}`));
        });
        $('#tabsBar').append(plusButton);
    }

    // Switch to last focussedCircuit
    if (data.focussedCircuit) { switchCircuit(data.focussedCircuit); }

    // Update the testbench UI
    updateTestbenchUI();

    updateSimulationSet(true);
    updateCanvasSet(true);
    gridUpdateSet(true);
    // Reset Timing
    if (!embed) plotArea.reset();
    scheduleUpdate(1);
}
