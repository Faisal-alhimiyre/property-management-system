/** Quick layout overlap check — run: node ar/scripts/validate-layouts.js */
var fs = require('fs');
var path = require('path');
var code = fs.readFileSync(path.join(__dirname, '../js/apartment-plan-templates.js'), 'utf8');
eval(code.replace(/\(function \(\)/, '(function validateLayoutModule'));

function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

var errors = [];
for (var b = 1; b <= 5; b++) {
  for (var ba = 1; ba <= 5; ba++) {
    var rooms = validateLayoutModule.buildScatterLayout(b, ba);
    var sat = rooms.filter(function (r) { return r.key !== 'living'; });
    var i, j;
    for (i = 0; i < sat.length; i++) {
      for (j = i + 1; j < sat.length; j++) {
        if (overlaps(sat[i], sat[j])) {
          errors.push(b + 'x' + ba + ': ' + sat[i].key + ' vs ' + sat[j].key);
        }
      }
    }
  }
}
if (errors.length) {
  console.error('OVERLAPS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('All 25 layouts OK');
