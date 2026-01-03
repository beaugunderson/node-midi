var midi = require('../../dist/midi.js')

var output = new midi.Output()

console.log('Is open ', output.isPortOpen())
output.openPort(0)
console.log('Is open ', output.isPortOpen())

output.closePort()
