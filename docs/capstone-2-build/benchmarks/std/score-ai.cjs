'use strict';

// Public Goal 2 entry point. The module retains the familiar CLI while all checks live in the
// versioned project-defined reference evaluator. A Gemini response is never its own answer key.
const evaluation = require('./score-ai-reference.cjs');
if (require.main === module) evaluation.cli(process.argv);
module.exports = evaluation;
