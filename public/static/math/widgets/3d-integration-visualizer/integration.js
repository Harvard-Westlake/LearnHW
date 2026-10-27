// Multivariable Integration Visualizer core

(function() {
    const $ = (id) => document.getElementById(id);

    // UI elements
    const canvasHost = $('canvas3d');
    const appRoot = document.querySelector('.app');
    const sidebarPanel = document.getElementById('sidebarPanel');
    const controlsToggle = $('controlsToggle');
    const drawerBackdrop = $('drawerBackdrop');
    const methodSelect = $('methodSelect');
    const presetSelect = $('presetSelect');
    const equationInput = $('equationInput');
    const renderBtn = $('renderBtn');
    const resetCameraBtn = $('resetCameraBtn');
    const showSurface = $('showSurface');
    const showColumns = $('showColumns');
    const showRegion = $('showRegion');
    const showWedge = $('showWedge');
    const declutterView = $('declutterView');
    const jacobianText = $('jacobianText');
    const integralEstimate = $('integralEstimate');
    const equationError = document.getElementById('equationError');
    // Onboarding / Help
    const helpButton = $('helpButton');
    const onboardingOverlay = $('onboardingOverlay');
    const onboardingClose = $('onboardingClose');
    const onboardingDontShow = $('onboardingDontShow');
    // Density and examples
    const densitySlider = $('densitySlider');
    const densityLabel = $('densityLabel');
    const exSphereVoxels = $('exSphereVoxels');
    const exCylinderVoxels = $('exCylinderVoxels');

    // Bounds
    const xMin = $('xMin'), xMax = $('xMax'), yMin = $('yMin'), yMax = $('yMax');
    const rMin = $('rMin'), rMax = $('rMax'), thetaMin = $('thetaMin'), thetaMax = $('thetaMax');
    const rcMin = $('rcMin'), rcMax = $('rcMax'), thetacMin = $('thetacMin'), thetacMax = $('thetacMax'), zMin = $('zMin'), zMax = $('zMax');
    const rhoMin = $('rhoMin'), rhoMax = $('rhoMax'), phiMin = $('phiMin'), phiMax = $('phiMax'), thetasMin = $('thetasMin'), thetasMax = $('thetasMax');
    const nx = $('nx'), ny = $('ny'), nz = $('nz');

    // Three.js core
    let renderer, scene, camera, controls;
    let contentRoot, surfaceGroup, columnsGroup, regionGroup, wedgeGroup, axesHelper, gridHelper, gridHelperNeg;
    // Auto-rotation around Z axis for demonstration
    let autoRotateZ = true;
    let autoRotateSpeed = 0.25; // radians per second (slower by default)
    let _lastFrameTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // Density level: 0 Off, 1 Light, 2 Medium, 3 Heavy
    let densityLevel = 1;

    function isNarrowScreen() {
        return (window.innerWidth || document.documentElement.clientWidth || 0) < 768;
    }

    // Drawer helpers (mobile)
    let lastFocusedBeforeDrawer = null;
    function setDrawer(open) {
        if (!appRoot || !sidebarPanel || !controlsToggle) return;
        appRoot.setAttribute('data-drawer', open ? 'open' : 'closed');
        controlsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (drawerBackdrop) drawerBackdrop.hidden = !open;
        // Manage focus
        if (open) {
            lastFocusedBeforeDrawer = document.activeElement;
            sidebarPanel.setAttribute('aria-hidden', 'false');
            // Focus first focusable within sidebar
            const focusables = sidebarPanel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusables.length > 0) {
                focusables[0].focus();
            } else {
                sidebarPanel.focus && sidebarPanel.focus();
            }
        } else {
            sidebarPanel.setAttribute('aria-hidden', 'true');
            if (lastFocusedBeforeDrawer && typeof lastFocusedBeforeDrawer.focus === 'function') {
                lastFocusedBeforeDrawer.focus();
            } else {
                controlsToggle.focus && controlsToggle.focus();
            }
        }
    }
    function closeDrawer() { setDrawer(false); }
    function openDrawer() { setDrawer(true); }

    function getHostSize() {
        const rect = canvasHost.getBoundingClientRect();
        let w = Math.max(1, Math.floor(rect.width || canvasHost.clientWidth || 1));
        let h = Math.max(1, Math.floor(rect.height || canvasHost.clientHeight || 1));
        if (w < 50 || h < 50) {
            // Fallback if layout hasn't sized yet
            const subtract = isNarrowScreen() ? 0 : 380;
            w = Math.max(300, (window.innerWidth || 0) - subtract);
            h = Math.max(300, window.innerHeight - 24);
        }
        return { w, h };
    }

    function updateDeclutter() {
        const on = !!(declutterView && declutterView.checked);
        if (axesHelper) axesHelper.visible = !on;
        if (gridHelper) gridHelper.visible = !on;
        if (gridHelperNeg) gridHelperNeg.visible = !on;
    }

    function setDensityLevel(level) {
        densityLevel = Math.max(0, Math.min(3, level|0));
        if (densityLabel) {
            densityLabel.textContent = densityLevel === 0 ? 'Off'
                : densityLevel === 1 ? 'Light'
                : densityLevel === 2 ? 'Medium' : 'Heavy';
        }
        const nxVal = densityLevel === 0 ? parseInt(nx.value) || 8
            : densityLevel === 1 ? 8
            : densityLevel === 2 ? 16 : 24;
        const nyVal = densityLevel === 0 ? parseInt(ny.value) || 8
            : densityLevel === 1 ? 8
            : densityLevel === 2 ? 16 : 24;
        const nzVal = densityLevel === 0 ? parseInt(nz.value) || 6
            : densityLevel === 1 ? 6
            : densityLevel === 2 ? 10 : 14;
        if (nx) nx.value = String(nxVal);
        if (ny) ny.value = String(nyVal);
        if (nz) nz.value = String(nzVal);
        if (showColumns) showColumns.checked = densityLevel > 0 ? (showColumns.checked || true) : false;
        render();
    }

    function showOnboardingIfNeeded() {
        try {
            const dismissed = localStorage.getItem('integrator_onboarding_dismissed') === '1';
            if (!dismissed && onboardingOverlay) {
                onboardingOverlay.hidden = false;
                onboardingOverlay.style.display = '';
            }
        } catch (e) {
            if (onboardingOverlay) {
                onboardingOverlay.hidden = false;
                onboardingOverlay.style.display = '';
            }
        }
    }

    function setupThree() {
        const { w, h } = getHostSize();
        const ratio = w / h;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        if ('outputColorSpace' in renderer) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        const pxRatio = isNarrowScreen() ? 1 : Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
        renderer.setPixelRatio(pxRatio);
        renderer.setSize(w, h);
        canvasHost.innerHTML = '';
        canvasHost.appendChild(renderer.domElement);
        // Basic click probe: visual dot + console logs to prove events are firing
        (function attachClickProbe() {
            const el = renderer.domElement;
            // Help pointer events on touch devices and avoid context menu blocking right-drag
            el.style.touchAction = 'none';
            el.addEventListener('contextmenu', (e) => e.preventDefault());
            function showClickDot(evt, color = '#ff3b7f', radius = 6) {
                const rect = el.getBoundingClientRect();
                const x = evt.clientX - rect.left;
                const y = evt.clientY - rect.top;
                const dot = document.createElement('div');
                dot.style.position = 'absolute';
                dot.style.left = (x - radius) + 'px';
                dot.style.top = (y - radius) + 'px';
                const size = (radius * 2) + 'px';
                dot.style.width = size;
                dot.style.height = size;
                dot.style.borderRadius = '50%';
                dot.style.background = color;
                dot.style.boxShadow = '0 0 0 2px rgba(0,0,0,.12)';
                dot.style.pointerEvents = 'none';
                dot.style.opacity = '1';
                dot.style.transform = 'scale(1)';
                dot.style.transition = 'transform 0.45s ease-out, opacity 0.6s ease-out';
                canvasHost.appendChild(dot);
                requestAnimationFrame(() => {
                    dot.style.transform = 'scale(2)';
                    dot.style.opacity = '0';
                });
                setTimeout(() => { dot.remove(); }, 650);
            }
            let isDragging = false;
            let startX = 0, startY = 0, lastX = 0, lastY = 0;
            let moveRAF = 0;
            let pendingMoveEvt = null;
            let autoRotateResumeTimer = 0;
            function pauseAutoRotate(ms = 1500) {
                autoRotateZ = false;
                if (autoRotateResumeTimer) clearTimeout(autoRotateResumeTimer);
                autoRotateResumeTimer = setTimeout(() => { autoRotateZ = true; }, ms);
            }
            // Zoom utility: uses OrbitControls dolly if present, else move camera along view vector
            function zoomBy(factor, anchorEvent) {
                pauseAutoRotate(1200);
                const s = Math.max(0.0001, Math.min(1000, factor));
                if (controls && typeof controls.dollyIn === 'function' && typeof controls.dollyOut === 'function') {
                    if (s < 1) controls.dollyIn(s); else controls.dollyOut(s);
                    controls.update && controls.update();
                } else {
                    const tgt = (controls && controls.target) ? controls.target : new THREE.Vector3(0, 0, 0);
                    const dir = new THREE.Vector3();
                    camera.getWorldDirection(dir);
                    const dist = camera.position.distanceTo(tgt);
                    const step = Math.max(0.05, dist * Math.abs(s - 1));
                    camera.position.addScaledVector(dir, s < 1 ? -step : step);
                    camera.updateProjectionMatrix();
                }
                if (anchorEvent) showClickDot(anchorEvent, '#b81f53', 3);
            }
            // Mouse wheel / trackpad zoom
            el.addEventListener('wheel', (evt) => {
                const speed = (controls && controls.zoomSpeed) ? controls.zoomSpeed : 1;
                const intensity = 0.0015 * speed;
                const s = Math.pow(1 + intensity, Math.abs(evt.deltaY));
                const factor = (evt.deltaY < 0) ? (1 / s) : s;
                zoomBy(factor, evt);
                evt.preventDefault();
                evt.stopImmediatePropagation();
            }, { passive: false });
            el.addEventListener('pointerdown', (evt) => {
                console.log('canvas pointerdown (drag start)', { button: evt.button, x: evt.clientX, y: evt.clientY });
                isDragging = true;
                startX = lastX = evt.clientX;
                startY = lastY = evt.clientY;
                try { el.setPointerCapture(evt.pointerId); } catch(e) {}
                pauseAutoRotate(2500);
            });
            el.addEventListener('pointermove', (evt) => {
                if (!isDragging) return;
                pendingMoveEvt = evt;
                if (moveRAF) return;
                moveRAF = requestAnimationFrame(() => {
                    const e = pendingMoveEvt;
                    moveRAF = 0;
                    pendingMoveEvt = null;
                    const dx = e.clientX - lastX;
                    const dy = e.clientY - lastY;
                    lastX = e.clientX;
                    lastY = e.clientY;
                    // Modifier-drag zoom (Shift or Alt)
                    if (e.shiftKey || e.altKey) {
                        const intensity = 0.006 * (e.shiftKey ? 1 : 0.5);
                        const s = Math.exp(Math.abs(dy) * intensity);
                        const factor = (dy < 0) ? (1 / s) : s; // drag up => zoom in
                        zoomBy(factor, e);
                        return;
                    }
                    console.log('canvas drag move', { dx, dy, x: e.clientX, y: e.clientY });
                    // Drive camera orbit if available; otherwise rotate the content as fallback
                    try {
                        const elementHeight = Math.max(1, el.clientHeight || el.height || 1);
                        const angleFactor = (2 * Math.PI) / elementHeight; // ~full rotation per viewport height
                        if (controls && typeof controls.rotateLeft === 'function' && typeof controls.rotateUp === 'function') {
                            controls.rotateLeft(dx * angleFactor);
                            controls.rotateUp(dy * angleFactor);
                            controls.update();
                        } else {
                            const rotSpeed = 0.01;
                            if (contentRoot) {
                                contentRoot.rotation.y += dx * rotSpeed;
                                contentRoot.rotation.x += dy * rotSpeed;
                            }
                        }
                    } catch (err) {
                        // no-op
                    }
                });
            });
            function endDrag(evt, label = 'pointerup') {
                if (!isDragging) return;
                isDragging = false;
                try { el.releasePointerCapture(evt.pointerId); } catch(e) {}
                const totalDx = evt.clientX - startX;
                const totalDy = evt.clientY - startY;
                console.log(`canvas ${label} (drag end)`, { x: evt.clientX, y: evt.clientY, totalDx, totalDy });
                // green marker for drag end
                showClickDot(evt, '#2ecc71', 6);
                pauseAutoRotate(1500);
            }
            el.addEventListener('pointerup', (evt) => endDrag(evt, 'pointerup'));
            el.addEventListener('pointercancel', (evt) => endDrag(evt, 'pointercancel'));
            el.addEventListener('click', (evt) => {
                console.log('canvas click', { x: evt.clientX, y: evt.clientY });
            });
        })();

        scene = new THREE.Scene();
        scene.background = null;

        camera = new THREE.PerspectiveCamera(55, ratio, 0.1, 1000);
        camera.position.set(8, 8, 8);
        scene.add(camera);

        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.enableZoom = true;
            controls.zoomSpeed = 1.0;
            controls.enablePan = true;
            controls.panSpeed = 0.8;
            controls.screenSpacePanning = true; // keep panning parallel to ground
            controls.minDistance = 0.25;       // allow zooming into the plane
            controls.maxDistance = 200;
            controls.target.set(0, 0, 0);
            controls.update();
        } else {
            controls = { update: () => {}, target: new THREE.Vector3(0, 0, 0) };
        }
        camera.lookAt(controls.target);

        const amb = new THREE.AmbientLight(0xffffff, 0.95);
        scene.add(amb);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 10, 7);
        scene.add(dir);

        axesHelper = new THREE.AxesHelper(4);
        scene.add(axesHelper);
        gridHelper = new THREE.GridHelper(16, 32, 0xbbc2ca, 0xd7dde3);
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.55;
        scene.add(gridHelper);
        // subtle duplicate just below the plane to make the negative side visually present
        gridHelperNeg = new THREE.GridHelper(16, 32, 0xdedede, 0xeeeeee);
        gridHelperNeg.material.transparent = true;
        gridHelperNeg.material.opacity = 0.3;
        gridHelperNeg.position.y = -0.0006;
        scene.add(gridHelperNeg);

        contentRoot = new THREE.Group();
        surfaceGroup = new THREE.Group();
        columnsGroup = new THREE.Group();
        regionGroup = new THREE.Group();
        wedgeGroup = new THREE.Group();
        contentRoot.add(surfaceGroup, columnsGroup, regionGroup, wedgeGroup);
        scene.add(contentRoot);

        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        onResize();
        animate();
    }

    function onResize() {
        if (!renderer || !camera) return;
        const { w, h } = getHostSize();
        renderer.setSize(w, h);
        camera.aspect = Math.max(1e-6, w / h);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
    }

    function animate() {
        requestAnimationFrame(animate);
        // time step for smooth and framerate-independent rotation
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const dt = Math.max(0, (now - _lastFrameTime) / 1000);
        _lastFrameTime = now;
        if (autoRotateZ && contentRoot) {
            const dAng = autoRotateSpeed * dt;
            contentRoot.rotation.z += dAng;
        }
        controls && controls.update();
        renderer && renderer.render(scene, camera);
    }

    // Utilities
    function clearGroup(group) {
        const toRemove = group.children.slice();
        for (const obj of toRemove) {
            group.remove(obj);
            if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose && m.dispose());
                else obj.material.dispose && obj.material.dispose();
            }
        }
    }

    function fitCameraToContent() {
        if (!contentRoot) return;
        // If no renderables yet, bail
        const anyChildren = contentRoot.children.some(g => g.children && g.children.length);
        if (!anyChildren) return;
        // Compute world-space bounding box of content
        const box = new THREE.Box3().setFromObject(contentRoot);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        // Recenter content so its center sits at the world origin
        contentRoot.position.sub(center);
        // Compute distance to frame content from current view direction
        const maxDim = Math.max(size.x, size.y, size.z);
        const fitDist = maxDim * 1.6 / Math.tan((camera.fov * Math.PI / 180) / 2);
        const prevTarget = (controls && controls.target) ? controls.target.clone() : new THREE.Vector3(0, 0, 0);
        const viewDir = camera.position.clone().sub(prevTarget).normalize();
        const dir = viewDir.lengthSq() > 0 ? viewDir : new THREE.Vector3(1, 0.8, 1).normalize();
        // Lock target at origin and place camera along the view direction
        if (controls && controls.target) controls.target.set(0, 0, 0);
        camera.position.copy(dir.multiplyScalar(fitDist));
        camera.lookAt(controls && controls.target ? controls.target : new THREE.Vector3(0, 0, 0));
        controls && controls.update && controls.update();
    }

    function deg2rad(d) { return d * Math.PI / 180; }

    function evalFunction(expr, x, y) {
        // Safe evaluate using math.js compiled expression
        try {
            const scope = { x, y, r: Math.hypot(x, y), theta: Math.atan2(y, x) };
            return expr.evaluate(scope);
        } catch (e) {
            return NaN;
        }
    }

    function tryCompileEquation() {
        const raw = equationInput.value || '0';
        try {
            const parsed = math.parse(raw);
            const compiled = parsed.compile();
            equationInput.classList.remove('input-error');
            if (equationError) { equationError.style.display = 'none'; equationError.textContent = ''; }
            // quick test eval
            const t = compiled.evaluate({ x: 0, y: 0 });
            if (!isFinite(t)) throw new Error('Result not finite');
            return compiled;
        } catch (err) {
            equationInput.classList.add('input-error');
            if (equationError) { equationError.style.display = 'block'; equationError.textContent = 'Invalid equation. Try expressions in x and y (e.g., sin(x)*cos(y)).'; }
            // fallback to zero function
            return math.parse('0').compile();
        }
    }

    function buildSurfaceFromFunction(expr, x0, x1, y0, y1, nxSamples, nySamples, color = 0x4cc3ff, opacity = 0.25) {
        const geom = new THREE.BufferGeometry();
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        const dx = (x1 - x0) / nxSamples;
        const dy = (y1 - y0) / nySamples;
        const grid = [];
        for (let i = 0; i <= nxSamples; i++) {
            grid[i] = [];
            for (let j = 0; j <= nySamples; j++) {
                const x = x0 + i * dx;
                const y = y0 + j * dy;
                const z = evalFunction(expr, x, y);
                grid[i][j] = { x, y, z: isFinite(z) ? z : 0 };
            }
        }

        for (let i = 0; i <= nxSamples; i++) {
            for (let j = 0; j <= nySamples; j++) {
                const p = grid[i][j];
                vertices.push(p.x, p.z, p.y); // using z-up -> map (x,z,y)
                uvs.push(i / nxSamples, j / nySamples);
            }
        }

        function pushQuad(a, b, c, d) {
            indices.push(a, b, d, b, c, d);
        }

        for (let i = 0; i < nxSamples; i++) {
            for (let j = 0; j < nySamples; j++) {
                const a = i * (nySamples + 1) + j;
                const b = (i + 1) * (nySamples + 1) + j;
                const c = (i + 1) * (nySamples + 1) + (j + 1);
                const d = i * (nySamples + 1) + (j + 1);
                pushQuad(a, b, c, d);
            }
        }

        geom.setIndex(indices);
        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
        // Reduce z-fighting with grid/edges
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        const mesh = new THREE.Mesh(geom, mat);
        // Add a crisp edge outline to make the surface visible on dark backgrounds
        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x7fd3ff, linewidth: 1 }));
        const g = new THREE.Group();
        g.add(mesh);
        g.add(line);
        return g;
    }

    function addRegionRectangle(x0, x1, y0, y1) {
        const geom = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0));
        const mat = new THREE.MeshBasicMaterial({ color: 0x8bd450, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        const mesh = new THREE.Mesh(geom, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set((x0 + x1) / 2, 0.001, (y0 + y1) / 2);
        regionGroup.add(mesh);

        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x8bd450 }));
        line.rotation.x = -Math.PI / 2;
        line.position.copy(mesh.position);
        regionGroup.add(line);
    }

    function addColumnsCartesian(expr, x0, x1, y0, y1, nxp, nyp) {
        const dx = (x1 - x0) / nxp;
        const dy = (y1 - y0) / nyp;
        const material = new THREE.MeshStandardMaterial({ color: 0xff7a59, transparent: true, opacity: 0.6 });
        let estimate = 0;
        const maxCols = isNarrowScreen() ? 900 : 1500;
        const total = nxp * nyp;
        const stride = total > maxCols ? Math.ceil(total / maxCols) : 1;
        let idx = 0;
        for (let i = 0; i < nxp; i++) {
            for (let j = 0; j < nyp; j++) {
                if (stride > 1 && ((idx++) % stride) !== 0) { continue; }
                const xc = x0 + (i + 0.5) * dx;
                const yc = y0 + (j + 0.5) * dy;
                const height = evalFunction(expr, xc, yc);
                if (!isFinite(height)) continue;
                const geom = new THREE.BoxGeometry(dx * 0.95, Math.abs(height), dy * 0.95);
                const col = new THREE.Mesh(geom, material);
                col.position.set(xc, Math.sign(height) * Math.abs(height) / 2, yc);
                columnsGroup.add(col);
                estimate += height * dx * dy;
            }
        }
        return estimate;
    }

    // Polar double integral visualization (sectors with Jacobian r)
    function addRegionPolar(r0, r1, t0, t1) {
        const shape = new THREE.Shape();
        const steps = 48;
        for (let k = 0; k <= steps; k++) {
            const t = t0 + (t1 - t0) * (k / steps);
            const x = r1 * Math.cos(t), y = r1 * Math.sin(t);
            if (k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        }
        for (let k = steps; k >= 0; k--) {
            const t = t0 + (t1 - t0) * (k / steps);
            const x = r0 * Math.cos(t), y = r0 * Math.sin(t);
            shape.lineTo(x, y);
        }
        shape.closePath();
        const geom = new THREE.ShapeGeometry(shape);
        const mat = new THREE.MeshBasicMaterial({ color: 0x8bd450, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        const mesh = new THREE.Mesh(geom, mat);
        mesh.rotation.x = -Math.PI / 2;
        regionGroup.add(mesh);
        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x8bd450 }));
        line.rotation.x = -Math.PI / 2;
        regionGroup.add(line);
    }

    function addColumnsPolar(expr, r0, r1, t0, t1, nr, nt) {
        const dr = (r1 - r0) / nr;
        const dt = (t1 - t0) / nt;
        let estimate = 0;
        const mat = new THREE.MeshStandardMaterial({ color: 0xff7a59, transparent: true, opacity: 0.6 });
        const maxCols = isNarrowScreen() ? 900 : 1500;
        const total = nr * nt;
        const stride = total > maxCols ? Math.ceil(total / maxCols) : 1;
        let idx = 0;
        for (let i = 0; i < nr; i++) {
            for (let j = 0; j < nt; j++) {
                if (stride > 1 && ((idx++) % stride) !== 0) { continue; }
                const rc = r0 + (i + 0.5) * dr;
                const tc = t0 + (j + 0.5) * dt;
                const x = rc * Math.cos(tc);
                const y = rc * Math.sin(tc);
                const h = evalFunction(expr, x, y);
                if (!isFinite(h)) continue;
                // approximate sector area: r dr dtheta
                const area = rc * dr * dt;
                const boxR = dr * 0.9;
                const arc = rc * dt * 0.9;
                const geom = new THREE.BoxGeometry(boxR, Math.abs(h), arc);
                const col = new THREE.Mesh(geom, mat);
                const cx = x, cy = y;
                col.position.set(cx, Math.sign(h) * Math.abs(h) / 2, cy);
                // rotate in xz-plane to align long axis tangentially
                col.rotation.y = tc;
                columnsGroup.add(col);
                estimate += h * area;
            }
        }
        return estimate;
    }

    // Triple integrals presets (volumes) and dV wedges
    function addVolumePreset(preset) {
        // Render a stock volume shape using bounds consistent with the ACTIVE method.
        // This prevents shapes from morphing when switching methods.
        const group = new THREE.Group();
        const method = methodSelect.value;
        const num = (el, d) => {
            const v = parseFloat(el?.value);
            return Number.isFinite(v) ? v : d;
        };
        const mat = new THREE.MeshStandardMaterial({ color: 0x4cc3ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
        let mesh = null;

        if (preset === 'sphere') {
            // Prefer the radius control that matches the active method.
            const R =
                method === 'triple_spherical' ? num(rhoMax, 2) :
                method === 'triple_cylindrical' ? num(rcMax, 2) :
                method === 'double_polar' ? num(rMax, 2) :
                Math.min(Math.abs(num(xMax, 2)), Math.abs(num(yMax, 2)));
            const geom = new THREE.SphereGeometry(Math.max(0.1, R), 48, 32);
            mesh = new THREE.Mesh(geom, mat);
        } else if (preset === 'cone' || preset === 'cylinder') {
            // Use cylindrical-style bounds when available; fall back gracefully.
            const R = num(rcMax, num(rMax, num(rhoMax, 1.5)));
            const y0 = num(zMin, 0), y1 = num(zMax, 3);
            const H = Math.max(0.1, y1 - y0);
            const geom = (preset === 'cone')
                ? new THREE.ConeGeometry(Math.max(0.1, R), H, 48)
                : new THREE.CylinderGeometry(Math.max(0.1, R), Math.max(0.1, R), H, 48);
            mesh = new THREE.Mesh(geom, mat);
            // Always render centered about world origin
            mesh.position.y = 0;
        } else if (preset === 'paraboloid') {
            const expr = math.parse('0.5*(x^2 + y^2)').compile();
            const x0 = num(xMin, -2.5), x1 = num(xMax, 2.5);
            const y0 = num(yMin, -2.5), y1 = num(yMax, 2.5);
            mesh = buildSurfaceFromFunction(expr, x0, x1, y0, y1, 64, 64, 0x4cc3ff, 0.22);
        }

        if (mesh) group.add(mesh);
        surfaceGroup.add(group);
    }

    function addDVWedgeCylindrical(r0, r1, t0, t1, z0, z1) {
        // Show a representative small rectangular box for dV = r dr dθ dz at some center
        const rc = (r0 + r1) / 2;
        const tc = (t0 + t1) / 2;
        const zc = (z0 + z1) / 2;
        const dr = Math.max((r1 - r0) / 12, 0.05);
        const dt = Math.max((t1 - t0) / 12, deg2rad(3));
        const dz = Math.max((z1 - z0) / 12, 0.05);

        const geom = new THREE.BoxGeometry(dr, dz, rc * dt);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff3b7f, transparent: true, opacity: 0.6 });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        const box = new THREE.Mesh(geom, mat);
        const x = rc * Math.cos(tc);
        const y = rc * Math.sin(tc);
        box.position.set(x, zc, y);
        // rotate around y (up) to align wedge in xz-plane
        box.rotation.y = tc;
        wedgeGroup.add(box);
    }

    function addDVWedgeSpherical(rho0, rho1, phi0, phi1, theta0, theta1) {
        // Show small curvilinear box ~ rho^2 sin phi d rho d phi d theta
        const rhoc = (rho0 + rho1) / 2;
        const phic = (phi0 + phi1) / 2;
        const thetac = (theta0 + theta1) / 2;
        const dr = Math.max((rho1 - rho0) / 14, 0.05);
        const dphi = Math.max((phi1 - phi0) / 14, deg2rad(3));
        const dtheta = Math.max((theta1 - theta0) / 14, deg2rad(3));
        const radial = dr;
        const tangential1 = rhoc * dphi;
        const tangential2 = rhoc * Math.sin(phic) * dtheta;
        const geom = new THREE.BoxGeometry(radial, tangential1, tangential2);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff3b7f, transparent: true, opacity: 0.6 });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        const x = rhoc * Math.sin(phic) * Math.cos(thetac);
        const y = rhoc * Math.sin(phic) * Math.sin(thetac);
        const z = rhoc * Math.cos(phic);
        const box = new THREE.Mesh(geom, mat);
        box.position.set(x, z, y);
        wedgeGroup.add(box);
    }

    // Triple integral bricks/voxels for numeric estimate and visualization
    function addVoxelsCylindrical(r0, r1, t0, t1, z0, z1, nr, nt, nz, include) {
        const dr = (r1 - r0) / nr;
        const dt = (t1 - t0) / nt;
        const dz = (z1 - z0) / nz;
        const mat = new THREE.MeshStandardMaterial({ color: 0xff7a59, transparent: true, opacity: 0.45 });
        let volume = 0;
        const maxCells = isNarrowScreen() ? 1800 : 2500; // guard performance
        const totalCells = nr * nt * nz;
        const stride = totalCells > maxCells ? Math.ceil(totalCells / maxCells) : 1;
        let idx = 0;
        for (let i = 0; i < nr; i++) {
            const rc = r0 + (i + 0.5) * dr;
            const boxR = dr * 0.98;
            const tangential = Math.max(rc * dt * 0.98, 0.001);
            for (let j = 0; j < nt; j++) {
                const tc = t0 + (j + 0.5) * dt;
                const x = rc * Math.cos(tc);
                const z = rc * Math.sin(tc);
                for (let k = 0; k < nz; k++, idx++) {
                    if (stride > 1 && (idx % stride) !== 0) continue;
                    const yc = z0 + (k + 0.5) * dz; // world y
                    if (include && !include(x, yc, z)) continue;
                    const geom = new THREE.BoxGeometry(boxR, dz * 0.98, tangential);
                    const box = new THREE.Mesh(geom, mat);
                    box.position.set(x, yc, z);
                    box.rotation.y = tc;
                    columnsGroup.add(box);
                }
                // Sum full contribution (not downsampled)
                for (let k = 0; k < nz; k++) {
                    const yc = z0 + (k + 0.5) * dz;
                    if (!include || include(x, yc, z)) {
                        volume += rc * dr * dt * dz;
                    }
                }
            }
        }
        return volume;
    }

    function addVoxelsSpherical(rh0, rh1, ph0, ph1, th0, th1, nr, nphi, nth, include) {
        const dr = (rh1 - rh0) / nr;
        const dphi = (ph1 - ph0) / nphi;
        const dtheta = (th1 - th0) / nth;
        const mat = new THREE.MeshStandardMaterial({ color: 0xff7a59, transparent: true, opacity: 0.45 });
        let volume = 0;
        const maxCells = isNarrowScreen() ? 2200 : 3000;
        const totalCells = nr * nphi * nth;
        const stride = totalCells > maxCells ? Math.ceil(totalCells / maxCells) : 1;
        let idx = 0;
        for (let i = 0; i < nr; i++) {
            const rhoc = rh0 + (i + 0.5) * dr;
            const radial = Math.max(dr * 0.98, 0.001);
            for (let j = 0; j < nphi; j++) {
                const phic = ph0 + (j + 0.5) * dphi;
                const tangential1 = Math.max(rhoc * dphi * 0.98, 0.001);
                for (let k = 0; k < nth; k++, idx++) {
                    if (stride > 1 && (idx % stride) !== 0) continue;
                    const thetac = th0 + (k + 0.5) * dtheta;
                    const tangential2 = Math.max(rhoc * Math.sin(phic) * dtheta * 0.98, 0.001);
                    const x = rhoc * Math.sin(phic) * Math.cos(thetac);
                    const y = rhoc * Math.cos(phic); // world y (up)
                    const z = rhoc * Math.sin(phic) * Math.sin(thetac);
                    if (include && !include(x, y, z)) continue;
                    const geom = new THREE.BoxGeometry(radial, tangential1, tangential2);
                    const box = new THREE.Mesh(geom, mat);
                    box.position.set(x, y, z);
                    // Orient voxel to local spherical basis (r, e_phi, e_theta)
                    const r = new THREE.Vector3(x, y, z).normalize();
                    // azimuthal tangent (theta)
                    const eTheta = new THREE.Vector3(-Math.sin(thetac), 0, Math.cos(thetac)).normalize();
                    // polar tangent (phi)
                    const ePhi = new THREE.Vector3(
                        Math.cos(phic) * Math.cos(thetac),
                        -Math.sin(phic),
                        Math.cos(phic) * Math.sin(thetac)
                    ).normalize();
                    const basis = new THREE.Matrix4();
                    basis.makeBasis(r, ePhi, eTheta);
                    box.setRotationFromMatrix(basis);
                    columnsGroup.add(box);
                }
                for (let k = 0; k < nth; k++) {
                    if (!include) {
                        volume += (rhoc * rhoc) * Math.sin(phic) * dr * dphi * dtheta;
                        continue;
                    }
                    const thetac = th0 + (k + 0.5) * dtheta;
                    const x = rhoc * Math.sin(phic) * Math.cos(thetac);
                    const y = rhoc * Math.cos(phic);
                    const z = rhoc * Math.sin(phic) * Math.sin(thetac);
                    if (include(x, y, z)) {
                        volume += (rhoc * rhoc) * Math.sin(phic) * dr * dphi * dtheta;
                    }
                }
            }
        }
        return volume;
    }

    // Renderers per method
    function renderDoubleCartesian() {
        const x0 = parseFloat(xMin.value), x1 = parseFloat(xMax.value);
        const y0 = parseFloat(yMin.value), y1 = parseFloat(yMax.value);
        const nxp = Math.max(2, parseInt(nx.value));
        const nyp = Math.max(2, parseInt(ny.value));
        jacobianText.textContent = 'dA = dx dy';
        clearGroup(surfaceGroup); clearGroup(columnsGroup); clearGroup(regionGroup); clearGroup(wedgeGroup);
        const compiled = tryCompileEquation();
        if (showSurface.checked) {
            const surf = buildSurfaceFromFunction(compiled, x0, x1, y0, y1, 64, 64);
            surfaceGroup.add(surf);
        }
        // For radial presets, show a disk region so the "cylinder/sphere/cone" intent is clear in Cartesian mode
        const preset = presetSelect.value;
        if (showRegion.checked) {
            if (preset === 'cylinder' || preset === 'sphere' || preset === 'cone') {
                const R = parseFloat(rMax.value) || parseFloat(rcMax.value) || parseFloat(rhoMax.value) ||
                          Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
                addRegionPolar(0, R, 0, 2 * Math.PI);
            } else {
                addRegionRectangle(x0, x1, y0, y1);
            }
        }
        let estimate = 0;
        if (showColumns.checked) {
            estimate = addColumnsCartesian(compiled, x0, x1, y0, y1, nxp, nyp);
        }
        if (showWedge.checked) {
            // representative dA rectangle
            const dx = (x1 - x0) / nxp, dy = (y1 - y0) / nyp;
            const geom = new THREE.BoxGeometry(dx, 0.02, dy);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff3b7f, transparent: true, opacity: 0.8 });
            const box = new THREE.Mesh(geom, mat);
            box.position.set(x0 + dx / 2, 0.01, y0 + dy / 2);
            box.rotation.x = Math.PI / 2;
            wedgeGroup.add(box);
        }
        integralEstimate.textContent = `Approx ∬ f dA ≈ ${estimate.toFixed(3)}`;
        fitCameraToContent();
    }

    function renderDoublePolar() {
        const r0 = parseFloat(rMin.value), r1 = parseFloat(rMax.value);
        const t0 = deg2rad(parseFloat(thetaMin.value)), t1 = deg2rad(parseFloat(thetaMax.value));
        const nr = Math.max(2, parseInt(nx.value));
        const nt = Math.max(2, parseInt(ny.value));
        jacobianText.textContent = 'In polar: dA = r dr dθ';
        clearGroup(surfaceGroup); clearGroup(columnsGroup); clearGroup(regionGroup); clearGroup(wedgeGroup);
        const expr = tryCompileEquation();
        if (showRegion.checked) addRegionPolar(r0, r1, t0, t1);
        if (showSurface.checked) {
            // sample surface over the bounding rectangle in xy
            const x0 = -r1, x1 = r1, y0 = -r1, y1 = r1;
            const surf = buildSurfaceFromFunction(expr, x0, x1, y0, y1, 64, 64);
            surfaceGroup.add(surf);
        }
        let estimate = 0;
        if (showColumns.checked) {
            estimate = addColumnsPolar(expr, r0, r1, t0, t1, nr, nt);
        }
        if (showWedge.checked) {
            const rc = (r0 + r1) / 2; const dt = (t1 - t0) / nt; const dr = (r1 - r0) / nr;
            const geom = new THREE.BoxGeometry(dr, 0.02, rc * dt);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff3b7f, transparent: true, opacity: 0.8 });
            const box = new THREE.Mesh(geom, mat);
            const tc = t0 + dt / 2;
            box.position.set(rc * Math.cos(tc), 0.01, rc * Math.sin(tc));
            box.rotation.y = tc;
            wedgeGroup.add(box);
        }
        integralEstimate.textContent = `Approx ∬ f dA ≈ ${estimate.toFixed(3)}`;
        fitCameraToContent();
    }

    function renderTripleCylindrical() {
        const r0 = parseFloat(rcMin.value), r1 = parseFloat(rcMax.value);
        const t0 = deg2rad(parseFloat(thetacMin.value)), t1 = deg2rad(parseFloat(thetacMax.value));
        const z0 = parseFloat(zMin.value), z1 = parseFloat(zMax.value);
        jacobianText.textContent = 'In cylindrical: dV = r dr dθ dz';
        clearGroup(surfaceGroup); clearGroup(columnsGroup); clearGroup(regionGroup); clearGroup(wedgeGroup);
        const preset = presetSelect.value;
        if (showSurface.checked && preset !== 'none') addVolumePreset(preset);
        if (showRegion.checked) addRegionPolar(r0, r1, t0, t1);
        let estimate = 0;
        if (showColumns.checked) {
            const nr = Math.max(2, parseInt(nx.value));
            const nt = Math.max(2, parseInt(ny.value));
            const nzp = Math.max(1, parseInt(nz.value));
            const preset = presetSelect.value;
            let include = null;
            if (preset === 'sphere') {
                const R = parseFloat(rcMax.value);
                include = (x, y, z) => (x * x + y * y + z * z) <= (R * R + 1e-9);
            } else if (preset === 'cone') {
                const R = parseFloat(rcMax.value);
                const y0 = parseFloat(zMin.value), y1 = parseFloat(zMax.value);
                const H = Math.max(1e-6, y1 - y0);
                // radius decreases linearly from base (y0) to apex (y1)
                include = (x, y, z) => {
                    if (y < y0 - 1e-9 || y > y1 + 1e-9) return false;
                    const rAllowed = Math.max(0, R * (y1 - y) / H);
                    return Math.hypot(x, z) <= rAllowed + 1e-9;
                };
            } else if (preset === 'paraboloid') {
                const a = 0.5;
                const y0 = 0;
                const y1 = parseFloat(zMax.value);
                include = (x, y, z) => y >= y0 - 1e-9 && y <= y1 + 1e-9 && y <= a * (x * x + z * z) + 1e-9;
            } // cylinder preset doesn't need clipping; domain already matches
            estimate = addVoxelsCylindrical(r0, r1, t0, t1, z0, z1, nr, nt, nzp, include);
        }
        if (showWedge.checked) addDVWedgeCylindrical(r0, r1, t0, t1, z0, z1);
        integralEstimate.textContent = estimate > 0 ? `Approx ∭ dV ≈ ${estimate.toFixed(3)}` : 'Volume visualization';
        fitCameraToContent();
    }

    function renderTripleSpherical() {
        const rh0 = parseFloat(rhoMin.value), rh1 = parseFloat(rhoMax.value);
        const ph0 = deg2rad(parseFloat(phiMin.value)), ph1 = deg2rad(parseFloat(phiMax.value));
        const th0 = deg2rad(parseFloat(thetasMin.value)), th1 = deg2rad(parseFloat(thetasMax.value));
        jacobianText.textContent = 'In spherical: dV = ρ² sinφ dρ dφ dθ';
        clearGroup(surfaceGroup); clearGroup(columnsGroup); clearGroup(regionGroup); clearGroup(wedgeGroup);
        const preset = presetSelect.value;
        if (showSurface.checked && preset !== 'none') addVolumePreset(preset);
        if (showRegion.checked) {
            // For sphere/cylinder/cone presets, show projected disk with radius R; otherwise approximate
            const preset = presetSelect.value;
            if (preset === 'cylinder' || preset === 'sphere' || preset === 'cone') {
                const R = parseFloat(rcMax.value) || parseFloat(rhoMax.value);
                addRegionPolar(0, R, th0, th1);
            } else {
                addRegionPolar(0, rh1 * Math.sin((ph0 + ph1) / 2), th0, th1);
            }
        }
        let estimate = 0;
        if (showColumns.checked) {
            const nr = Math.max(2, parseInt(nx.value));
            const nphi = Math.max(2, parseInt(ny.value));
            const nth = Math.max(2, parseInt(nz.value));
            const preset = presetSelect.value;
            // Masks to clip spherical voxels to preset shapes
            let include = null;
            if (preset === 'cylinder') {
                include = (x, y, z) => {
                    const R = parseFloat(rcMax.value);
                    const z0 = parseFloat(zMin.value), z1 = parseFloat(zMax.value);
                    return (x * x + z * z) <= (R * R + 1e-9) && y >= (z0 - 1e-9) && y <= (z1 + 1e-9);
                };
            } else if (preset === 'sphere') {
                include = (x, y, z) => {
                    const R = parseFloat(rhoMax.value) || parseFloat(rcMax.value);
                    return (x * x + y * y + z * z) <= (R * R + 1e-9);
                };
            } else if (preset === 'cone') {
                include = (x, y, z) => {
                    const R = parseFloat(rcMax.value);
                    const y0 = parseFloat(zMin.value), y1 = parseFloat(zMax.value);
                    const H = Math.max(1e-6, y1 - y0);
                    if (y < y0 - 1e-9 || y > y1 + 1e-9) return false;
                    const rAllowed = Math.max(0, R * (y1 - y) / H);
                    return Math.hypot(x, z) <= rAllowed + 1e-9;
                };
            } else if (preset === 'paraboloid') {
                include = (x, y, z) => {
                    const a = 0.5;
                    const y0 = 0;
                    const y1 = parseFloat(zMax.value);
                    return y >= y0 - 1e-9 && y <= y1 + 1e-9 && y <= a * (x * x + z * z) + 1e-9;
                };
            }
            estimate = addVoxelsSpherical(rh0, rh1, ph0, ph1, th0, th1, nr, nphi, nth, include);
        }
        if (showWedge.checked) addDVWedgeSpherical(rh0, rh1, ph0, ph1, th0, th1);
        integralEstimate.textContent = estimate > 0 ? `Approx ∭ dV ≈ ${estimate.toFixed(3)}` : 'Volume visualization';
        fitCameraToContent();
    }

    function updatePanelsVisibility() {
        const method = methodSelect.value;
        $('boundsCartesian').hidden = method !== 'double_cartesian';
        $('equationPanel').hidden = method.startsWith('triple_');
        $('boundsPolar').hidden = method !== 'double_polar';
        $('boundsCylindrical').hidden = method !== 'triple_cylindrical';
        $('boundsSpherical').hidden = method !== 'triple_spherical';
    }

    // Choose an appropriate integration method for the given preset so it renders correctly
    function autoSelectMethodForPreset(preset) {
        if (!methodSelect) return;
        let target = null;
        if (preset === 'sphere') {
            target = 'triple_spherical';
        } else if (preset === 'cylinder' || preset === 'cone') {
            target = 'triple_cylindrical';
        } else if (preset === 'paraboloid') {
            // Paraboloid is naturally a surface z = f(x, y); show with double integrals.
            // Prefer polar to highlight radial symmetry; Cartesian also works.
            target = 'double_polar';
        }
        if (target && methodSelect.value !== target) {
            methodSelect.value = target;
            updatePanelsVisibility();
        }
    }

    function applyPresetBounds() {
        const preset = presetSelect.value;
        if (preset === 'cone') {
            xMin.value = -2; xMax.value = 2; yMin.value = -2; yMax.value = 2;
            rMin.value = 0; rMax.value = 2; thetaMin.value = 0; thetaMax.value = 360;
            rcMin.value = 0; rcMax.value = 2; thetacMin.value = 0; thetacMax.value = 360; zMin.value = -1.5; zMax.value = 1.5;
            rhoMin.value = 0; rhoMax.value = 3; phiMin.value = 0; phiMax.value = 90; thetasMin.value = 0; thetasMax.value = 360;
            equationInput.value = 'sqrt(x^2 + y^2)';
        } else if (preset === 'sphere') {
            xMin.value = -2.5; xMax.value = 2.5; yMin.value = -2.5; yMax.value = 2.5;
            rMin.value = 0; rMax.value = 2.5; thetaMin.value = 0; thetaMax.value = 360;
            rcMin.value = 0; rcMax.value = 2.5; thetacMin.value = 0; thetacMax.value = 360; zMin.value = -2.5; zMax.value = 2.5;
            rhoMin.value = 0; rhoMax.value = 2.5; phiMin.value = 0; phiMax.value = 180; thetasMin.value = 0; thetasMax.value = 360;
            equationInput.value = 'sqrt(max(0, 2.5^2 - x^2 - y^2))';
        } else if (preset === 'cylinder') {
            xMin.value = -2; xMax.value = 2; yMin.value = -2; yMax.value = 2;
            rMin.value = 0; rMax.value = 2; thetaMin.value = 0; thetaMax.value = 360;
            rcMin.value = 0; rcMax.value = 2; thetacMin.value = 0; thetacMax.value = 360; zMin.value = -2; zMax.value = 2;
            rhoMin.value = 0; rhoMax.value = 3; phiMin.value = 0; phiMax.value = 180; thetasMin.value = 0; thetasMax.value = 360;
            // For double integrals, represent a cylinder as a constant-height surface over a disk base
            equationInput.value = '2';
        } else if (preset === 'paraboloid') {
            xMin.value = -3; xMax.value = 3; yMin.value = -3; yMax.value = 3;
            rMin.value = 0; rMax.value = 3; thetaMin.value = 0; thetaMax.value = 360;
            rcMin.value = 0; rcMax.value = 3; thetacMin.value = 0; thetacMax.value = 360; zMin.value = 0; zMax.value = 5;
            rhoMin.value = 0; rhoMax.value = 5; phiMin.value = 0; phiMax.value = 120; thetasMin.value = 0; thetasMax.value = 360;
            equationInput.value = '0.5*(x^2 + y^2)';
        }
    }

    function render() {
        const method = methodSelect.value;
        if (method === 'double_cartesian') return renderDoubleCartesian();
        if (method === 'double_polar') return renderDoublePolar();
        if (method === 'triple_cylindrical') return renderTripleCylindrical();
        if (method === 'triple_spherical') return renderTripleSpherical();
    }

    function init() {
        setupThree();
        updatePanelsVisibility();
        applyPresetBounds();
        // If a stock shape is selected on load, switch to a matching method
        autoSelectMethodForPreset(presetSelect.value);
        // Beginner-first defaults
        if (showSurface) showSurface.checked = true;
        if (showRegion) showRegion.checked = true;
        if (showWedge) showWedge.checked = true;
        if (showColumns) showColumns.checked = false;
        if (densitySlider) {
            densitySlider.value = String(densityLevel);
        }
        render();
        updateDeclutter();
        showOnboardingIfNeeded();

        // Events
        if (controlsToggle) {
            controlsToggle.addEventListener('click', () => {
                if (!isNarrowScreen()) return;
                const open = (appRoot?.getAttribute('data-drawer') !== 'open');
                setDrawer(open);
            });
        }
        if (drawerBackdrop) {
            drawerBackdrop.addEventListener('click', () => closeDrawer());
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && appRoot?.getAttribute('data-drawer') === 'open') {
                closeDrawer();
            } else if (e.key === 'Tab' && appRoot?.getAttribute('data-drawer') === 'open') {
                // simple focus trap inside sidebar
                const focusables = sidebarPanel?.querySelectorAll?.('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (!focusables || focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                const active = document.activeElement;
                if (e.shiftKey && active === first) { last.focus(); e.preventDefault(); }
                else if (!e.shiftKey && active === last) { first.focus(); e.preventDefault(); }
            }
        });
        window.addEventListener('resize', () => {
            if (!isNarrowScreen()) {
                // Ensure drawer closed on desktop
                setDrawer(false);
            }
        });
        methodSelect.addEventListener('change', () => { updatePanelsVisibility(); applyPresetBounds(); render(); });
        presetSelect.addEventListener('change', () => {
            autoSelectMethodForPreset(presetSelect.value);
            updatePanelsVisibility();
            applyPresetBounds();
            render();
        });
        [equationInput, xMin, xMax, yMin, yMax, rMin, rMax, thetaMin, thetaMax, nx, ny, nz,
         rcMin, rcMax, thetacMin, thetacMax, zMin, zMax, rhoMin, rhoMax, phiMin, phiMax, thetasMin, thetasMax]
            .forEach(el => el.addEventListener('change', render));
        [showSurface, showColumns, showRegion, showWedge].forEach(el => el.addEventListener('change', render));
        if (declutterView) declutterView.addEventListener('change', () => { updateDeclutter(); render(); });
        if (densitySlider) {
            densitySlider.addEventListener('input', () => setDensityLevel(parseInt(densitySlider.value)));
            densitySlider.addEventListener('change', () => setDensityLevel(parseInt(densitySlider.value)));
        }
        if (helpButton && onboardingOverlay) {
            helpButton.addEventListener('click', () => {
                onboardingOverlay.hidden = false;
                onboardingOverlay.style.display = '';
            });
        }
        if (onboardingClose) {
            onboardingClose.addEventListener('click', () => {
                if (!onboardingOverlay) return;
                onboardingOverlay.hidden = true;
                onboardingOverlay.style.display = 'none';
                try {
                    if (onboardingDontShow && onboardingDontShow.checked) {
                        localStorage.setItem('integrator_onboarding_dismissed', '1');
                    }
                } catch (e) {}
            });
        }
        if (exSphereVoxels) {
            exSphereVoxels.addEventListener('click', () => {
                methodSelect.value = 'triple_spherical';
                updatePanelsVisibility();
                presetSelect.value = 'sphere';
                applyPresetBounds();
                if (showSurface) showSurface.checked = true;
                if (showRegion) showRegion.checked = true;
                if (showWedge) showWedge.checked = true;
                if (showColumns) showColumns.checked = true;
                setDensityLevel(2);
            });
        }
        if (exCylinderVoxels) {
            exCylinderVoxels.addEventListener('click', () => {
                methodSelect.value = 'triple_cylindrical';
                updatePanelsVisibility();
                presetSelect.value = 'cylinder';
                applyPresetBounds();
                if (showSurface) showSurface.checked = true;
                if (showRegion) showRegion.checked = true;
                if (showWedge) showWedge.checked = true;
                if (showColumns) showColumns.checked = true;
                setDensityLevel(2);
            });
        }
        renderBtn.addEventListener('click', render);
        resetCameraBtn.addEventListener('click', () => {
            camera.position.set(8, 8, 8);
            controls.target.set(0, 0, 0);
            controls.update();
        });
    }

    // Kickoff when DOM ready
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();


