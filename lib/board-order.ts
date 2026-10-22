export function boardSection(board:{archived:boolean,pinned?:boolean}){return board.archived?'archive':board.pinned?'pinned':'boards'}
