export type WidgetInfo = {
  title: string
  src: string
  blurb?: string
}

export const MATH_WIDGETS: Record<string, WidgetInfo> = {
  'cubic-sequences': { title: 'Cubic Sequences', src: '/static/math/widgets/cubic-sequences/cubic-sequences.html' },
  'exponential-explorer': { title: 'Exponential Explorer', src: '/static/math/widgets/exponential-explorer/exponential-transformations.html' },
  'exponential-sequences': { title: 'Exponential Sequences', src: '/static/math/widgets/exponential-sequences/exponential-sequences.html' },
  'game-of-life': { title: 'Game of Life', src: '/static/math/widgets/game-of-life/game-of-life.html' },
  'hanoi-tower': { title: 'Hanoi Tower', src: '/static/math/widgets/hanoi-tower/hanoi-tower.html' },
  'hexagon-rotator': { title: 'Hexagon Rotator', src: '/static/math/widgets/hexagon-rotator/hexagon-rotator.html' },
  'linear-sequences': { title: 'Linear Sequences', src: '/static/math/widgets/linear-sequences/linear-sequences.html' },
  'logarithmic-explorer': { title: 'Logarithmic Explorer', src: '/static/math/widgets/logarithmic-explorer/logarithmic-transformations.html' },
  'nonogram': { title: 'Nonogram', src: '/static/math/widgets/nonogram/nonogram.html' },
  'polar-graph-visualizer': { title: 'Polar Graph Visualizer', src: '/static/math/widgets/polar-graph-visualizer/graph.html' },
  'quadratic-explorer': {
    title: 'Quadratic Explorer',
    src: '/static/math/widgets/quadratic-explorer/quadratic-transformations.html',
    blurb: 'React-powered parabola and transformation explorer.',
  },
  'quadratic-sequences': { title: 'Quadratic Sequences', src: '/static/math/widgets/quadratic-sequences/quadratic-differences.html' },
  'rectangle-rotator': { title: 'Rectangle Rotator', src: '/static/math/widgets/rectangle-rotator/rectangle-rotator.html' },
  'square-completer': { title: 'Square Completer', src: '/static/math/widgets/square-completer/square-completer.html' },
  'template': { title: 'Transformations Template', src: '/static/math/widgets/template/transformations-template.html' }
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
  'blob-creation': { title: 'Blob Creation (Git-style)', src: '/static/code/widgets/blob-creation/blob-creation.html' },
  'objects-static': { title: 'Java Objects & Static Methods — Visual Memory', src: '/static/code/widgets/objects-static/objects-static.html' },
  'rsa-encryption': { title: 'RSA Encryption (Demo)', src: '/static/code/widgets/rsa-encrpytion/rsa-encryption.html' },
  'shamir': { title: "Shamir's Secret Sharing", src: '/static/code/widgets/shamir/shamir.html' },
  'singly-linked-list': { title: 'Singly Linked List — Memory Visualizer', src: '/static/code/widgets/singly-linked-list/singly-linked-list.html' }
}

export const STATS_WIDGETS: Record<string, WidgetInfo> = {
  't-test-for-means': { title: 't-Test for Means', src: '/static/stats/widgets/t-test-for-means/t-test-for-means.html' }
}

export const HISTORY_WIDGETS: Record<string, WidgetInfo> = {
  'chocolate-history': { title: 'Chocolate: A Global History', src: '/static/history/widgets/chocolate-history/chocolate-history.html' },
  'timeline-map': { title: 'Chocolate: Timeline Map', src: '/static/history/widgets/chocolate-history/timeline-map.html' },
  'history-map': { title: 'World Timeline — 2D/3D Map', src: '/static/history/widgets/history-map/history-map.html' }
}
