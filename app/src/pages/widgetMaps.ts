export type WidgetInfo = {
  title: string
  src: string
  blurb?: string
}

export const MATH_WIDGETS: Record<string, WidgetInfo> = {
  'cubic-sequences': { title: 'Cubic Sequences', src: '/static/math/widgets/cubic-sequences/cubic-sequences.html', blurb: "Build a cubic sequence term by term and see why its third differences are constant." },
  'exponential-explorer': { title: 'Exponential Explorer', src: '/static/math/widgets/exponential-explorer/exponential-transformations.html', blurb: "Change the base, stretch, reflect, and shift bˣ and track where the key point (0, 1) and the asymptote go." },
  'exponential-sequences': { title: 'Exponential Sequences', src: '/static/math/widgets/exponential-sequences/exponential-sequences.html', blurb: "Grow a geometric sequence by a common ratio and compare it to an exponential function." },
  'game-of-life': { title: 'Game of Life', src: '/static/math/widgets/game-of-life/game-of-life.html', blurb: "Seed a grid and step Conway's Game of Life to watch simple rules produce complex patterns." },
  'hanoi-tower': { title: 'Hanoi Tower', src: '/static/math/widgets/hanoi-tower/hanoi-tower.html', blurb: "Move the disks of the Tower of Hanoi and count the minimum moves as the stack grows." },
  'hexagon-rotator': { title: 'Hexagon Rotator', src: '/static/math/widgets/hexagon-rotator/hexagon-rotator.html', blurb: "Rotate a hexagon about its center to explore rotational symmetry and angle measures." },
  'linear-sequences': { title: 'Linear Sequences', src: '/static/math/widgets/linear-sequences/linear-sequences.html', blurb: "Build an arithmetic sequence and see its common difference appear in the table and on the line." },
  'logarithmic-explorer': { title: 'Logarithmic Explorer', src: '/static/math/widgets/logarithmic-explorer/logarithmic-transformations.html', blurb: "Transform log_b(x) with stretches, reflections, and shifts and watch the vertical asymptote and domain move." },
  'nonogram': { title: 'Nonogram', src: '/static/math/widgets/nonogram/nonogram.html', blurb: "Solve picture-logic puzzles by reasoning from the row and column clues." },
  'polar-graph-visualizer': { title: 'Polar Graph Visualizer', src: '/static/math/widgets/polar-graph-visualizer/graph.html', blurb: "Plot r = f(θ) and see how polar equations trace circles, roses, and spirals." },
  'quadratic-explorer': { title: 'Quadratic Explorer', src: '/static/math/widgets/quadratic-explorer/quadratic-transformations.html', blurb: "Stretch, reflect, and shift a parabola while its vertex form, standard form, and key points update." },
  'quadratic-sequences': { title: 'Quadratic Sequences', src: '/static/math/widgets/quadratic-sequences/quadratic-differences.html', blurb: "Build a quadratic sequence and discover why its second differences are constant." },
  'rectangle-rotator': { title: 'Rectangle Rotator', src: '/static/math/widgets/rectangle-rotator/rectangle-rotator.html', blurb: "Rotate a rectangle about a point to explore rotations on the coordinate plane." },
  'square-completer': { title: 'Square Completer', src: '/static/math/widgets/square-completer/square-completer.html', blurb: "Complete the square with an area model to rewrite a quadratic in vertex form." },
  'template': { title: 'Transformations Template', src: '/static/math/widgets/template/transformations-template.html', blurb: "Starter layout for building a new transformations widget." }
}

export const HTCS_LESSON_WIDGETS: Record<string, WidgetInfo> = {
  'htcs-unit-6-day-1': { title: 'HTCS Unit 6 Day 1', src: '/static/code/lessons/HTCS/HTCS_Unit6_Day1.html' },
  'htcs-unit-6-day-2': { title: 'HTCS Unit 6 Day 2', src: '/static/code/lessons/HTCS/HTCS_Unit6_Day2.html' },
  'htcs-unit-6-day-3': { title: 'HTCS Unit 6 Day 3', src: '/static/code/lessons/HTCS/HTCS_Unit6_Day3.html' },
  'htcs-unit-6-day-4': { title: 'HTCS Unit 6 Day 4', src: '/static/code/lessons/HTCS/HTCS_Unit6_Day4.html' },
  'htcs-unit-6-day-5': { title: 'HTCS Unit 6 Day 5', src: '/static/code/lessons/HTCS/HTCS_Unit6_Day5.html' },
  'htcs-unit-6-day-6': { title: 'HTCS Unit 6 Day 6', src: '/teaching-resources/lessons/computer-science/day6-react' },
}

export const CODE_WIDGETS: Record<string, WidgetInfo> = {
  'blob-creation': { title: 'Blob Creation (Git-style)', src: '/static/code/widgets/blob-creation/blob-creation.html', blurb: "Hash file contents into a Git blob and see how content, not the filename, determines the object ID." },
  'objects-static': { title: 'Java Objects & Static Methods — Visual Memory', src: '/static/code/widgets/objects-static/objects-static.html', blurb: "Watch memory as objects are created and static methods run, separating instance state from class-level code." },
  'rsa-encryption': { title: 'RSA Encryption (Demo)', src: '/static/code/widgets/rsa-encrpytion/rsa-encryption.html', blurb: "Generate RSA keys from two primes, then encrypt and decrypt a message step by step." },
  'shamir': { title: "Shamir's Secret Sharing", src: '/static/code/widgets/shamir/shamir.html', blurb: "Split a secret into shares and see how many pieces it takes to rebuild it." },
  'singly-linked-list': { title: 'Singly Linked List — Memory Visualizer', src: '/static/code/widgets/singly-linked-list/singly-linked-list.html', blurb: "Insert and remove nodes and follow the pointers as a singly linked list changes in memory." }
}

export const STATS_WIDGETS: Record<string, WidgetInfo> = {
  't-test-for-means': { title: 't-Test for Means', src: '/static/stats/widgets/t-test-for-means/t-test-for-means.html', blurb: "Compare two sample means and see how the t statistic and p-value respond to spread and sample size." }
}

export const HISTORY_WIDGETS: Record<string, WidgetInfo> = {
  'chocolate-history': { title: 'Chocolate: A Global History', src: '/static/history/widgets/chocolate-history/chocolate-history.html', blurb: "Trace chocolate's path across the globe from Mesoamerica to modern trade." },
  'timeline-map': { title: 'Chocolate: Timeline Map', src: '/static/history/widgets/chocolate-history/timeline-map.html', blurb: "Scrub a timeline to see where chocolate was grown, traded, and enjoyed over the centuries." },
  'history-map': { title: 'World Timeline — 2D/3D Map', src: '/static/history/widgets/history-map/history-map.html', blurb: "Explore world history on a 2D and 3D map across time." }
}
