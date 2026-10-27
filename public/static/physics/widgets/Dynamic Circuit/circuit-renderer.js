/**
 * Circuit Renderer - SVG Drawing and Visualization
 * Handles rendering the circuit diagram with proper layout
 */

class CircuitRenderer {
    constructor(svgElement, circuit) {
        this.svg = svgElement;
        this.circuit = circuit;
        this.group = document.getElementById('circuit-group');
        
        // Layout constants
        this.margin = { top: 50, right: 100, bottom: 50, left: 100 };
        this.componentSpacing = 150; // Horizontal spacing between series components
        this.parallelSpacing = 100; // Vertical spacing for parallel components
        this.wireLength = 60; // Length of connecting wires
        
        // Power supply position
        this.batteryX = this.margin.left;
        this.batteryY = 300;
        
        this.selectedComponent = null;
    }

    render() {
        // Clear existing circuit
        this.group.innerHTML = '';
        
        const topology = this.circuit.getTopology();
        
        // Calculate positions for all components (stacked vertically on right side)
        const positions = this.calculatePositions(topology);
        
        // Draw power supply
        this.drawBattery(this.batteryX, this.batteryY);
        
        // Circuit dimensions
        const rightSideX = 700; // Fixed X position for right side components
        const topY = this.batteryY - 150;
        const bottomY = this.batteryY + 150;
        
        // Top wire from battery positive terminal
        this.drawWire(this.batteryX, this.batteryY - 40, this.batteryX, topY);
        this.drawWire(this.batteryX, topY, rightSideX, topY);
        
        // Track current Y position as we stack components vertically
        let currentY = topY;
        
        // If no components, still draw a complete loop and a friendly message
        if (topology.length === 0) {
            // Vertical backbone with no components
            this.drawWire(rightSideX, currentY, rightSideX, bottomY);
            // Bottom rail back to battery
            this.drawWire(rightSideX, bottomY, this.batteryX, bottomY);
            this.drawWire(this.batteryX, bottomY, this.batteryX, this.batteryY + 40);
            this.renderEmptyCircuit();
            return;
        }
        
        // Draw all components stacked vertically on the right side
        topology.forEach((parallelGroup, seriesIndex) => {
            if (parallelGroup.length === 1) {
                // Single component in series
                const component = parallelGroup[0];
                const pos = positions[seriesIndex][0];
                
                // Determine connector thickness along the vertical backbone
                const connectorHalfHeight = component.isBulb() ? 20 : 7.5; // bulb radius or half resistor height
                
                // Wire down from current position to just touch the component edge
                this.drawWire(rightSideX, currentY, rightSideX, pos.y - connectorHalfHeight);
                
                // Component
                this.drawComponent(component, rightSideX, pos.y);
                
                // Continue backbone from the component's lower edge
                currentY = pos.y + connectorHalfHeight;
            } else {
                // Multiple components in parallel - branch out horizontally
                const firstY = positions[seriesIndex][0].y;
                const lastY = positions[seriesIndex][positions[seriesIndex].length - 1].y;
                
                // Draw vertical wire from current position to first parallel component
                this.drawWire(rightSideX, currentY, rightSideX, firstY);
                
                // Draw vertical wire connecting all parallel branches (the main backbone)
                this.drawWire(rightSideX, firstY, rightSideX, lastY);
                
                // Draw each parallel branch
                parallelGroup.forEach((component, parallelIndex) => {
                    const pos = positions[seriesIndex][parallelIndex];
                    
                    // Determine connector offset to meet component edge
                    const connectorOffset = component.isBulb() ? 20 : 25; // bulb radius or half resistor width
                    
                    // Horizontal wire out to component edge
                    this.drawWire(rightSideX, pos.y, pos.x - connectorOffset, pos.y);
                    
                    // Component
                    this.drawComponent(component, pos.x, pos.y);
                    
                    // Horizontal wire back from component edge
                    this.drawWire(pos.x + connectorOffset, pos.y, rightSideX, pos.y);
                });
                
                // Continue down after parallel section
                currentY = lastY;
            }
        });
        
        // Wire down to bottom rail
        this.drawWire(rightSideX, currentY, rightSideX, bottomY);
        
        // Bottom rail back to battery
        this.drawWire(rightSideX, bottomY, this.batteryX, bottomY);
        this.drawWire(this.batteryX, bottomY, this.batteryX, this.batteryY + 40);
    }

    calculatePositions(topology) {
        const positions = [];
        const rightSideX = 700; // X position for series components
        const parallelOffsetX = 600; // X position for parallel components (to the left)
        const verticalSpacing = 70; // Spacing between series components
        const parallelVerticalSpacing = 60; // Spacing for parallel components
        
        let currentY = this.batteryY - 120; // Start position from top
        
        topology.forEach((parallelGroup, seriesIndex) => {
            const groupPositions = [];
            const numParallel = parallelGroup.length;
            
            if (numParallel === 1) {
                // Single component in series - stack vertically on right side
                groupPositions.push({ x: rightSideX, y: currentY });
                currentY += verticalSpacing;
            } else {
                // Multiple parallel components - branch out to the left
                const totalHeight = (numParallel - 1) * parallelVerticalSpacing;
                const startY = currentY - totalHeight / 2;
                
                parallelGroup.forEach((component, parallelIndex) => {
                    groupPositions.push({
                        x: parallelOffsetX,
                        y: startY + parallelIndex * parallelVerticalSpacing
                    });
                });
                
                // Advance past the parallel group
                currentY += totalHeight / 2 + verticalSpacing;
            }
            
            positions.push(groupPositions);
        });
        
        return positions;
    }

    drawBattery(x, y) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'battery');
        
        // Positive terminal (longer line) - top
        const positiveLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        positiveLine.setAttribute('x1', x - 20);
        positiveLine.setAttribute('y1', y - 40);
        positiveLine.setAttribute('x2', x + 20);
        positiveLine.setAttribute('y2', y - 40);
        positiveLine.setAttribute('class', 'battery-positive');
        positiveLine.setAttribute('stroke-width', '4');
        g.appendChild(positiveLine);
        
        // Negative terminal (shorter line) - bottom
        const negativeLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        negativeLine.setAttribute('x1', x - 15);
        negativeLine.setAttribute('y1', y + 40);
        negativeLine.setAttribute('x2', x + 15);
        negativeLine.setAttribute('y2', y + 40);
        negativeLine.setAttribute('class', 'battery-negative');
        negativeLine.setAttribute('stroke-width', '4');
        g.appendChild(negativeLine);
        
        // Middle lines
        for (let i = 0; i < 2; i++) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const offset = i === 0 ? -15 : 15;
            line.setAttribute('x1', x - 12);
            line.setAttribute('y1', y + offset);
            line.setAttribute('x2', x + 12);
            line.setAttribute('y2', y + offset);
            line.setAttribute('stroke', '#34495e');
            line.setAttribute('stroke-width', '3');
            g.appendChild(line);
        }
        
        // Plus and minus symbols
        const plusText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        plusText.setAttribute('x', x + 30);
        plusText.setAttribute('y', y - 35);
        plusText.setAttribute('font-size', '18');
        plusText.setAttribute('fill', '#e74c3c');
        plusText.setAttribute('font-weight', 'bold');
        plusText.textContent = '+';
        g.appendChild(plusText);
        
        const minusText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        minusText.setAttribute('x', x + 30);
        minusText.setAttribute('y', y + 45);
        minusText.setAttribute('font-size', '18');
        minusText.setAttribute('fill', '#34495e');
        minusText.setAttribute('font-weight', 'bold');
        minusText.textContent = '−';
        g.appendChild(minusText);
        
        // Voltage label
        const voltageText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        voltageText.setAttribute('x', x - 60);
        voltageText.setAttribute('y', y + 5);
        voltageText.setAttribute('class', 'component-label');
        voltageText.textContent = `${this.circuit.voltage.toFixed(1)}V`;
        g.appendChild(voltageText);
        
        this.group.appendChild(g);
    }

    drawWire(x1, y1, x2, y2) {
        const wire = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        wire.setAttribute('x1', x1);
        wire.setAttribute('y1', y1);
        wire.setAttribute('x2', x2);
        wire.setAttribute('y2', y2);
        wire.setAttribute('class', 'wire');
        this.group.appendChild(wire);
    }

    drawJunction(x, y) {
        const junction = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        junction.setAttribute('cx', x);
        junction.setAttribute('cy', y);
        junction.setAttribute('r', 4);
        junction.setAttribute('fill', '#2c3e50');
        this.group.appendChild(junction);
    }

    drawComponent(component, x, y) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'component');
        g.setAttribute('data-component-id', component.id);
        g.setAttribute('data-x', x);
        g.setAttribute('data-y', y);
        g.style.cursor = 'pointer';
        
        if (component.isBulb()) {
            this.drawLightbulb(g, component, x, y);
        } else {
            this.drawResistor(g, component, x, y);
        }
        
        // Event listeners will be added by CircuitInteractions
        this.group.appendChild(g);
    }

    drawResistor(g, component, x, y) {
        const width = 50;
        const height = 15;
        
        // Resistor body (rectangle)
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x - width / 2);
        rect.setAttribute('y', y - height / 2);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('class', 'resistor-body');
        g.appendChild(rect);
        
        // Labels
        this.addComponentLabels(g, component, x, y);
    }

    drawLightbulb(g, component, x, y) {
        const radius = 20;
        const power = component.power;
        const maxPower = Math.max(this.circuit.getMaxBulbPower(), 0.1);
        const brightness = Math.min(power / maxPower, 1);
        
        // Bulb circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', radius);
        
        if (power > 0.01) {
            // Bulb is on - calculate brightness
            circle.setAttribute('class', 'lightbulb-glow');
            
            // Adjust fill opacity based on power
            const opacity = 0.3 + brightness * 0.7;
            circle.style.fillOpacity = opacity;
            
            // Add glow filter based on brightness
            if (brightness > 0.7) {
                circle.setAttribute('filter', 'url(#glow-high)');
            } else if (brightness > 0.3) {
                circle.setAttribute('filter', 'url(#glow-medium)');
            } else {
                circle.setAttribute('filter', 'url(#glow-low)');
            }
        } else {
            // Bulb is off
            circle.setAttribute('class', 'lightbulb-off');
        }
        
        g.appendChild(circle);
        
        // Filament
        const filament = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const filamentPath = `M ${x - 8} ${y - 5} Q ${x} ${y - 10} ${x + 8} ${y - 5} 
                             M ${x - 8} ${y + 5} Q ${x} ${y} ${x + 8} ${y + 5}`;
        filament.setAttribute('d', filamentPath);
        filament.setAttribute('class', 'filament');
        if (power > 0.01) {
            filament.style.stroke = '#ff6b6b';
            filament.style.strokeWidth = 1 + brightness * 1.5;
        }
        g.appendChild(filament);
        
        // Labels
        this.addComponentLabels(g, component, x, y);
    }

    addComponentLabels(g, component, x, y) {
        // Only show resistance value - positioned to the right side
        const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nameText.setAttribute('x', x + 35);
        nameText.setAttribute('y', y + 5);
        nameText.setAttribute('class', 'component-label');
        nameText.setAttribute('text-anchor', 'start');
        nameText.textContent = `${component.resistance}Ω`;
        g.appendChild(nameText);
        
        // Note: V, I, P stats will be shown in popup when selected
    }

    renderEmptyCircuit() {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', 500);
        text.setAttribute('y', 300);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'component-label');
        text.setAttribute('font-size', '24');
        text.textContent = 'Add components to start building your circuit';
        this.group.appendChild(text);
    }

    showStatsPopup(componentId) {
        // Remove any existing popup
        this.hideStatsPopup();
        
        const stats = this.circuit.getComponentStats(componentId);
        if (!stats) {
            console.log('No stats found for component', componentId);
            return;
        }
        
        const component = this.circuit.getComponentById(componentId);
        if (!component) {
            console.log('Component not found', componentId);
            return;
        }
        
        // Find component position from stored data attributes
        const componentEl = document.querySelector(`[data-component-id="${componentId}"]`);
        if (!componentEl) {
            console.log('Component element not found', componentId);
            return;
        }
        
        const x = parseFloat(componentEl.getAttribute('data-x'));
        const y = parseFloat(componentEl.getAttribute('data-y'));
        
        console.log('Creating popup at', x, y, 'for component', componentId);
        
        // Create popup group - position next to the component
        const popup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        popup.setAttribute('id', 'stats-popup');
        popup.setAttribute('class', 'stats-popup');
        
        // Position popup to the right of the component
        const popupX = x + 80;
        const popupY = y - 30;
        
        // Background rectangle
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', popupX);
        bg.setAttribute('y', popupY);
        bg.setAttribute('width', 120);
        bg.setAttribute('height', 60);
        bg.setAttribute('rx', 5);
        bg.setAttribute('class', 'popup-bg');
        popup.appendChild(bg);
        
        // Voltage text
        const vText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        vText.setAttribute('x', popupX + 10);
        vText.setAttribute('y', popupY + 20);
        vText.setAttribute('class', 'popup-text');
        vText.setAttribute('text-anchor', 'start');
        vText.textContent = `V = ${stats.voltage.toFixed(2)} V`;
        popup.appendChild(vText);
        
        // Current text
        const iText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        iText.setAttribute('x', popupX + 10);
        iText.setAttribute('y', popupY + 35);
        iText.setAttribute('class', 'popup-text');
        iText.setAttribute('text-anchor', 'start');
        iText.textContent = `I = ${stats.current.toFixed(3)} A`;
        popup.appendChild(iText);
        
        // Power text
        const pText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        pText.setAttribute('x', popupX + 10);
        pText.setAttribute('y', popupY + 50);
        pText.setAttribute('class', 'popup-text');
        pText.setAttribute('text-anchor', 'start');
        pText.textContent = `P = ${stats.power.toFixed(2)} W`;
        popup.appendChild(pText);
        
        this.group.appendChild(popup);
        console.log('Popup created and appended');
    }
    
    hideStatsPopup() {
        const existingPopup = document.getElementById('stats-popup');
        if (existingPopup) {
            existingPopup.remove();
        }
    }

    showComponentDetails(componentId) {
        const stats = this.circuit.getComponentStats(componentId);
        if (!stats) return;
        
        const detailsPanel = document.getElementById('component-details');
        const infoDiv = document.getElementById('component-info');
        
        infoDiv.innerHTML = `
            <p><strong>Type:</strong> ${stats.name}</p>
            <p><strong>Resistance:</strong> ${stats.resistance.toFixed(1)} Ω</p>
            <p><strong>Voltage Drop:</strong> ${stats.voltage.toFixed(2)} V</p>
            <p><strong>Current:</strong> ${stats.current.toFixed(3)} A</p>
            <p><strong>Power:</strong> ${stats.power.toFixed(2)} W</p>
            <p><strong>Position:</strong> Series ${stats.position.seriesIndex + 1}, 
               ${stats.position.parallelIndex > 0 ? `Parallel ${stats.position.parallelIndex + 1}` : 'Single'}</p>
        `;
        
        detailsPanel.style.display = 'block';
        
        // Set up delete button
        const deleteBtn = document.getElementById('delete-component-btn');
        deleteBtn.onclick = () => {
            this.circuit.removeComponent(componentId);
            this.render();
            this.updateStats();
            detailsPanel.style.display = 'none';
            this.selectedComponent = null;
        };
    }

    updateStats() {
        const stats = this.circuit.getStats();
        
        document.getElementById('total-voltage').textContent = `${stats.voltage.toFixed(1)} V`;
        document.getElementById('total-current').textContent = `${stats.totalCurrent.toFixed(3)} A`;
        document.getElementById('total-resistance').textContent = `${stats.totalResistance.toFixed(2)} Ω`;
        document.getElementById('total-power').textContent = `${stats.totalPower.toFixed(2)} W`;
    }
}

// Global renderer instance (will be initialized after DOM loads)
let renderer = null;

