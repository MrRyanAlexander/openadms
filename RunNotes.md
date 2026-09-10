Run Notes

--- raw notes ----

Field App - as a monitor

Open on your phone - Your open tickets
Start a ticket (should only show the types the monitor is registered to make, which means each monitor needs to have options on what they are allowed to work on or not)
Collection = create load tickets
Disposal = create disposal tickets
Unit Rate (given type) = create (given type) unit rate tickets
Haul Out = ....
And so on ... 

Think of it like this... When monitors are assigned to work on specific things for the day, that will mean they'll be focusing on mainly that aspect of work and wont need to have a busy app. So the UI needs to only show what is needed. 

The UI feels busy - lets consolidate it
header should have the project and selection built into it so it is accessible at anytime on scrolling the page, and there needs to be an open ticket counter that appears in the header when the user scrolls past their open tickets, so they can always click that and jump into their open tickets. Same for opening a new ticket, should be like the same so it is always one click away for the user. 

The back office is robust. It's ready to build more into it.

Database Data Access: 
Roles need to be much more robust**
A monitor should be given specific read only, write access to ONLY what they need to change
Same for all other roles
Permissions inside of the system need to be handled like any enterprise access control policy would

--- end raw notes ----

Another aspect of this all is we "must" integrate with Geo Portal services. Most will want to use ArcGIS geoportal maps. We have an example of using that as part of a prior system - noted in SYSTEM_NEEDS.md. 

So far we have the system up and running in Railway with the API active and our Database up and running. We are actively saving data in and out of the database and able to see things working as expected at this stage of the demo. 

Now we need to analyze SYSTEM_NEEDS.md in depth and think about the system we are building while learning from the first principles outlined. Our system must be able to do the things outlined. 


