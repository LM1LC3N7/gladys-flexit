# Flexit Nordic

Shows a **Flexit Nordic** heat recovery ventilation unit (S2, S3, S4, CL2,
CL3, CL4, KS3) in Gladys over **BACnet/IP** (UDP port 47808) on your local
network, without any cloud. Unofficial integration, **not affiliated with
Flexit**. **Never tested with a real device**: it follows the objects of the
open-source library flexit_bacnet (the one of Home Assistant) and Flexit's
published BACnet list; please report what your unit shows.

## What you get

One Gladys device, "Flexit Nordic ventilation", with:

- temperatures: outdoor, supply, extract, exhaust, room (CI70 panel), and the
  two air temperature setpoints (Home, Away);
- humidity: extract air (some models), rooms 1 to 3 (CI77 sensors; a sensor
  that reads 0 % is taken as absent);
- supply and exhaust fans (signal in %, speed in rpm), heat exchanger speed
  and efficiency, electric heater state and power (kW);
- operation mode (`off`, `away`, `home`, `high`, `cooker-hood`, `fireplace`,
  `temporary-high`), comfort button, cooker hood and fireplace modes, time
  remaining and duration of the fireplace mode and of the rapid ventilation;
- filter: operating time, exchange interval, "filter to replace".

## Setting up

1. Make sure BACnet is enabled on the unit and give it a **fixed IP address**
   in your router (DHCP reservation).
2. In Gladys, open the integration, enter the **IP address** of the unit and
   the **BACnet device id** (2 unless it was changed), save.
3. Add the unit from the **Discovery** tab.

The unit is read every 60 seconds by default (30 s to 1 h), never sooner:
not when you press "Test the connection", not after a restart of Gladys or of
the integration. BACnet has **no password**: anyone on your network can read
and drive the unit, so keep it on a **trusted network**.

## Commands (off by default)

With **Allow the commands** off, every command below is refused, except the
three "back to normal" ones further down. Turn it on to let Gladys:

- set the **ventilation mode** (Away, Home, High; "Stop" is never offered;
  only while the comfort button is on, else the unit stays Away and the
  command is refused with that reason);
- set the **air temperature setpoints** Home and Away (10 to 30 °C by 0.5);
- start the **rapid ventilation** or the **fireplace mode** (for their
  duration set on the unit; the fireplace mode creates an overpressure that
  helps a wood stove draw);
- turn the **cooker hood mode** or the **electric heater** on;
- turn the **comfort button** on or off (off: the unit goes to Away after its
  delay);
- **reset the filter timer**.

**Always allowed**: turn the electric heater off, turn the cooker hood mode
off, stop the fireplace mode. Turning the heater off removes a heat source;
the two others bring the ventilation back to normal (they are not a safety
action: stopping the fireplace or cooker hood mode while a stove burns or the
hood runs removes the air compensation). They are never held back by the
option, another command or a backoff, and are refused only when another unit
is identified at the address. The heater and cooker hood off are always
written, without a read before. The fireplace stop is a toggle: it is sent
only when a read just before shows the mode on; if that read fails, it is
refused, and the reads of the next two minutes send it as soon as they show
the mode on.

How the other commands go:

- the state of the unit and its serial number are read just before; the
  command is refused if they cannot be read, if no serial number was ever
  read (check the BACnet device id), if the unit is **stopped** (Gladys never
  restarts it: comfort button off is refused too, as it overrides Stop), or
  if another unit answers at the address;
- nothing is sent when the unit is already in the state asked;
- the fireplace and rapid ventilation triggers act as **toggles**: a trigger
  is sent only when the state read shows it is needed, and never again while
  a previous one is not visible yet;
- the command is sent within 3.5 seconds of the click, or refused unsent; it
  is confirmed only when the unit reads back the value asked; otherwise
  Gladys says "sent, without confirmation" and reads the unit again after 5
  and 20 seconds;
- an "always allowed" command not confirmed is sent again (twice at most) by
  the reads of the next two minutes while the unit still shows it on.

Selects and buttons only: no switch and no thermostat, so a "turn everything
off" from a voice assistant or a scene never reaches the ventilation.

## Identity of the unit

The serial number of the unit is kept at the first read (its BACnet Device
object, asked by the standard wildcard instance and by the device id typed).
Until it is read, the status says so and the commands are refused, except the
three "always allowed" ones. If another unit answers at the same address
later (a replaced unit, or a DHCP swap), nothing of it is shown, every command
is refused (the "always allowed" ones included) and the status says so. If you replaced the unit, press **Accept the unit at this
address** once (it shows the serial found), then again within 2 minutes: the
same Gladys device and its history are kept.

## Limits

- No automatic discovery: Flexit's app finds units with a proprietary
  broadcast; the integration does not imitate it, the address is typed.
- Fan setpoints per mode, durations of the fireplace and rapid ventilation
  modes, and the heater nominal power are not changed from Gladys (v1).
- Stopping the ventilation is not offered.
- The integration keeps in `/data` only the time of its last read and the
  serial number of the unit.
