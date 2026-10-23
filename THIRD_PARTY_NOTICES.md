# Third-party notices

This integration is licensed under the Apache License 2.0 (see `LICENSE`). It
contains logic ported to JavaScript from the project below. The ported parts
were rewritten, not copied; the changes are described below.

## flexit_bacnet

<https://github.com/piotrbulinski/flexit_bacnet> (package `flexit_bacnet`,
version 2.2.3, the library of Home Assistant's Flexit Nordic (BACnet)
integration), by Piotr Buliński. MIT License, full text of its `LICENSE` file
below.

Ported in `src/constants.js`, `src/bacnet/protocol.js`, `src/bacnet/values.js`
and `src/bacnet/client.js`: BACnet/IP on UDP port 47808 without
authentication; the ReadPropertyMultiple and WriteProperty requests as it
encodes them (BVLC original-unicast, NPDU expecting a reply, confirmed request
accepting a segmented answer of up to 4 segments of 1024 bytes, a REAL for an
analog value, an ENUMERATED for a binary value, an UNSIGNED otherwise, write
priority 13 for the comfort button, the ventilation mode and the cooker hood);
the decoding of the answer (object identifier, list of results, property
value or access error, application tags unsigned, real, character string,
enumerated); the BACnet objects of the Flexit Nordic units (from Flexit's
"BACnet Nordic Basic" list, as flexit_bacnet names them): operation mode MSV
361 and its values, ventilation mode MSV 42 and its values, comfort button BV
50, air temperature setpoints AV 1994 and AV 1985, fireplace trigger MSV 360,
state BV 400, remaining time AV 2038 and duration PIV 270, rapid ventilation
trigger MSV 357, remaining time AV 2031 and duration PIV 293, the
temperatures (AI 1, 4, 11, 59 with AI 95 when AI 59 reads 0, AI 75), the
humidities (AI 96, AV 2093 to 2095), the fan tachometers AI 5 and 12, fan
signals AO 3 and 4, heat exchanger speed AO 0 and efficiency AV 2023, electric
heater BV 445 and its power AV 194, cooker hood BV 402, filter operating time
AV 285, exchange interval AV 286, polluted BV 522 and timer reset MSV 613; the
trigger value 2; the Device object read for its name and its serial number
(description); the table of models by the first six digits of the serial; the
roundings of the values. From Home Assistant's integration (Apache-2.0,
information only, nothing copied): the default device id 2, the setpoint range
10 to 30 °C by 0.5, and the note that the fireplace trigger acts as a toggle.

Changed: each request has its own invoke id, which the answer must carry, and
only a datagram from the address and port of the unit is looked at; every
length of an answer is checked against the datagram (one linear pass, a
datagram over 1497 bytes dropped unread, a segmented answer refused, an
Error, Reject or Abort reported as refused by the unit); an access error or an
implausible value is unknown, never 0; the reads of a poll are split in three
requests whose answers fit in one frame; the Siemens discovery of
flexit_bacnet (a broadcast of a payload captured from Flexit's app) is not
used: the address is typed by the user. Everything else (polling, identity,
commands, guards, Gladys) is this integration's own.

```
MIT License

Copyright (c) 2022 Piotr Buliński

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
