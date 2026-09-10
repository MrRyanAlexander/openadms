System Needs Notes (Best Practices Take-Aways)

================================================================================
SYSTEM REFERENCE PRECIS: ROW COLLECTION MONITOR
================================================================================


2. SYSTEM STATUS & TELEMETRY MONITORING
--------------------------------------------------------------------------------
* Connectivity Heartbeat: Color-coded connection health telemetry (e.g., Green 
  for active synchronization, Red/Pending for network drops).
* Queue Sync Management: Granular outbound queues monitoring distinct data payloads 
  (Control Tickets, Waypoints, Photos, and Incident Reports).
* Sync Remediation Protocols: User-guided recovery instruction forcing physical 
  relocation to cellular coverage zones when upload queues stagnate.

3. CORE DATA WORKFLOW A: DEBRIS TICKETING & LOCATION INGESTION
--------------------------------------------------------------------------------
* Initial Ingestion: Dual-input processing supporting automated barcode scanning 
  (primary) and manual alphanumeric override (fallback) for vehicle identification.
* Hardware State Acknowledgments: Discrete verification prompts confirming download 
  states before advancing the user state.
* Spatial Grounding (Waypoints): Capturing geospatial coordinate anchors at the 
  precise pickup node. System rule: One waypoint per distinct pickup pile node; 
  explicit prohibition against creating individual tickets per waypoint.
* Imaging Protocols: Forced landscape aspect ratio for context photography. 
  Synchronous focus validation step prior to payload serialization.
* Ticket Closure Lifecycle:
  1. Validation step cross-referencing asset data.
  2. Classification matrix for localized debris categorization.
  3. Reverse-geocoding lookup via GPS to seed local address metadata, 
     backed by an editable text override layer.
  4. Logical boundary sorting (Zone assignment routing).
  5. Audit log generation .
  6. Final chain-of-custody binding by scanning a consecutive physical Control 
     Ticket barcode and capturing an explicit digital signature ("Agree and Sign").

4. CORE DATA WORKFLOW B: MULTI-ENTITY INCIDENT REPORTING
--------------------------------------------------------------------------------
* Triage Matrix: Instant categorization of event types paired with a toggle for 
  "High Priority" escalations (mandatory for personal injury events).
* Positional Pinning: Direct geolocation snapshot ("Mark Location") mapped at 
  the safe boundary limit of the hazard zone.
* Visual Proof Ingestion: Multi-photo attachment sequence for event documentation.
* Dynamic Stakeholder Ingestion: Form-rendering paths tailored to involved actors:
  - Internal: Tetra Tech Employee Name + Employee ID tracking.
  - Contractor: Firm Name + Vehicle Tracker Id + Operator Name mapping.
  - Public: Homeowner Name + Direct Telephony routing.
* Payload Validation & Dispatch: Free-text description wrapper, centralized 
  hyperlinked review screen allowing individual nested edits, and asynchronous 
  upload submission.
* End-of-Day Redundancy: Mandatory requirement for verbal notification backstops 
  to management to close out digital incident filings.
================================================================================

================================================================================
SYSTEM REFERENCE PRECIS: ROW DISPOSAL MONITOR
================================================================================

1. LOGISTIC SITE INITIALIZATION & DEVICE POLICIES
--------------------------------------------------------------------------------
* Location Binding: Mandatory configuration step during login forcing the user 
  to declare a "Default Disposal Site" before authorization state completes.
* Security & Charging: Strict prohibition of personal usage with remote system 
  auditing. Device must remain on AC power charger when idle; complete device 
  power-downs are blocked.
* Inbound Queue Visibility: Real-time telemetry tracking en-route logistics, 
  specifically showing "Pending Tickets Downloaded" and "Downloaded Trucks" 
  to forecast processing volumes.

2. CORE DATA WORKFLOW A: INBOUND LOAD DISPOSAL (TICKET COMPLETION)
--------------------------------------------------------------------------------
* Verification Chain: Ingests inbound collection ticket barcode -> Fetches and 
  displays system-cached truck photo and vehicle data -> Forces visual cross-check 
  against the physical truck and placard metadata.
* Discrepancy Exception Handling: Debris type selection step enforces matching logic. 
  If field-selected type does not align with the collection log classification, 
  the system mandates pulling the vehicle aside and halting the transaction 
  pending supervisor intervention.
* Volumetric Capacity Assessment: "Load Call" calculation interface requiring 
  input of either "Percent Full" or "CuYds Empty" (with automatic inverse 
  calculation handled natively by the backend logic).
* Receipt Triplication: Hard physical print requirement following digital signature. 
  Must emit exactly three physical copies of the receipt voucher for distributed 
  stakeholder validation (Driver, Contractor, Tetra Tech).
* Retrospective Printing: Built-in local database query interface enabling 
  historical receipt retrieval and reproduction via direct Ticket Number lookup.

3. CORE DATA WORKFLOW B: SPECIAL HANDLING & BULK SCALE WEIGHING
--------------------------------------------------------------------------------
* Hazard Logging: Specialized input stream for capturing hazardous materials 
  (e.g., Stumps, White Goods/Appliances) via inbound driver barcode ingestion.
* Scale Metric Logging: Independent data capture flow logging heavy equipment scale 
  metrics. Explicitly maps a tracking system ticket ID to an external weight 
  (supporting variable units: pounds or tons) and a physical "Scale Ticket Number".

4. CORE DATA WORKFLOW C: OUTBOUND HAULOUT LOGISTICS (DMS TO FINAL DISPOSAL)
--------------------------------------------------------------------------------
* Haulout Initialization (at TDSRS or DMS reduction sites):
  1. Ingests next sequential ticket barcode from physical ticket book allocation.
  2. Scans/enters Truck ID with manual correction overrides for the asset data.
  3. Classifies outbound debris type and requires an active outbound Load Call (% Full).
  4. Forces capture of a verification photograph documenting load volume prior to submission.
* Haulout Closure (at Final Disposal Site location):
  1. Matches and terminates open haulout sequences via driver-provided ticket barcode scan.
  2. Declares the specific terminal destination node ("Final Disposal Site").
  3. Image capture requirement to digitize the physical "Bill of Lading" document.
  4. Finalizes cycle with the mandatory 3-part physical receipt generation step.

5. CORE DATA WORKFLOW D: INCIDENT REPORTING MATRICES
--------------------------------------------------------------------------------
* Triage & Positional Anchors: Standardized categorization menu matching the 
  Collection module layout, including High Priority flags for safety hazards, 
  localized coordinate locking ("Mark Location"), and multi-image attachment flows.
* Stakeholder Mapping: Tri-party input vectors segmenting internal resources 
  (Employee Name/No), logistical operators (Contractor/Truck/Driver info), 
  or public entities (Homeowner contact logs) to route reporting data appropriately.
================================================================================

================================================================================
SYSTEM REFERENCE OUTLINE: INCIDENT REPORTING SYSTEM
================================================================================

1. SYSTEM AUTHENTICATION & ACCESS CONTROL
--------------------------------------------------------------------------------
* Identity Mapping: User login requires a unique identifier tied directly to physical credentials (e.g., Employee Number mapped to Badge Number).
* Multi-Factor/Two-Step Entry: Requires a combination of ID and a numeric Personal Identification Number (PIN).
* Account Lockout Protocol: Automated lockout mechanism on failure. System must provide a clear support path (direct telephone line/routing extension) to a supervisor or support desk for manual override.

2. SYSTEM HEALTH & DATA SYNCHRONIZATION MONITORING
--------------------------------------------------------------------------------
* Real-Time Telemetry/Heartbeat: Persistent connection status indicated via visual cues (e.g., Green/Red "Last Checkin" status indicator).
* Asynchronous Data Queues: Separate queues for structured data ("Pending Documents/Certs") and unstructured rich media ("Photos").
* Zero-State Queue Target: System must prioritize emptying the upload queues immediately upon gaining network connectivity.
* Fail-Soft Alerts: If connection heartbeats fail or queues stall, the UI must prompt the user to escalate the issue to operational management.

3. CORES STEP-BY-STEP INCIDENT REPORTING FLOW (DATA INGESTION)
--------------------------------------------------------------------------------
* Step 1: Initial Ingestion & Classification
  - Event initiation triggers an workflow modal.
  - Hierarchical Categorization: Users must first select the "Type" of incident (e.g., Survey) before choosing the granular "Category."
* Step 2: Criticality Flagging
  - Optional toggle to mark the record as "High Priority" for triage.
* Step 3: Geospatial Localization
  - Automated GPS capture via a "Mark Location" action.
  - Manual Fallback: Mandatory user text input for physical addresses if GPS telemetry fails or is inaccurate.
* Step 4: Rich Media Attachment
  - Camera integration allows taking one or more photographs.
  - Instant validation/commit loop: Each asset must be saved and confirmed ("Done" and "OK") before advancing.
* Step 5: Entity Association (Conditional Logic Tables)
  - Stakeholder conditional blocks check for three distinct user profiles:
    a. Internal Employee: Capture Name and Employee Number.
    b. Third-Party Contractor: Capture Company Name, Asset/Truck Number, and Operator Name.
    c. External Public/Homeowner: Capture Contact Name and Phone Number.
  - Fallback logic: Empty fields bypass validation smoothly if no stakeholder is flagged.
* Step 6: Narrative Capture
  - Multimodal text entry box supporting standard keyboard input and speech-to-text dictation.
* Step 7: Review & Final Submission
  - Summary Screen: Consolidates all input data fields before submission.
  - Deep-Linking: Every data category on the summary screen must include a direct link back to its respective input state for inline editing.
  - Submission Interstitial: A confirmation prompt ("Are you sure?") before final database commit. Upon success, state resets to the application home screen.

4. SYSTEM SECURITY, HARDWARE, & OPERATIONAL CONSTRAINTS
--------------------------------------------------------------------------------
* Device Sandboxing & Lockdown: MDM (Mobile Device Management) policies must restrict the device from accessing personal calls, messaging, or open internet browsing. Unauthorized usage triggers compliance actions (termination protocol).
* Power Management Lifecycle: Continuous power state required (keep on AC charger). Hardware must not be powered down; instead, use system screen savers to manage display sleep cycles.
* Environmental Hardening: Hardware and enclosures must protect against moisture and excessive thermal limits.
* Safety Interlocks (Crucial UX): Hard warning explicitly banning the operation of the intake application while operating a motor vehicle.
================================================================================


================================================================================
SYSTEM REFERENCE OUTLINE: UNIT RATE TICKETING SYSTEM
================================================================================

1. CORE ARCHITECTURAL PARADIGM: PHASED STATE MACHINE
--------------------------------------------------------------------------------
* Linear Workflow Dependency: The ticket lifecycle is divided into three distinct, chronological phases: Pre-Work -> Measure -> Post-Work.
* Visual Phase Anchors: The UI relies on color-coded state transitions (e.g., Phase button starts as Red/Incomplete and transforms to Green/Complete upon satisfying all field validation rules).
* Peripheral Hardware Dependencies: Requires active hardware integrations for:
  a. Scanning barcode/QR crew credentials.
  b. Field printing (Bluetooth/Wi-Fi mobile ticket printers).

2. PHASE 1: TICKET INITIATION & PRE-WORK (STATE: INITIAL)
--------------------------------------------------------------------------------
* Step 1: External Entity Validation
  - Capture Crew Certification Number via hardware scanning or manual alphanumeric override.
  - Capture/Verify Crew Supervisor Name string.
* Step 2: Entity Evidence Attachment
  - Mandatory photograph capturing both the active Crew and their designated physical Placard.
* Step 3: Hazard Categorization
  - Strict boolean/enforced selection between two distinct asset types: "Hanger" or "Leaner".
* Step 4: Baseline Evidence Capture
  - Mandatory "Pre-Work Eligibility Photo" focusing closely on the untouched hazard.
* Step 5: Geospatial Positioning & Field Safety Interlock
  - Execute automated GPS telemetry pull ("Mark Location") with manual address correction fallback.
  - Safety Step-Back UX: Upon location confirmation, the application must display a mandatory interstitial prompt forcing the operator to acknowledge moving to a safe zone while fieldwork commences.
* State Change: Pre-Work state transitions from Red to Green.

3. PHASE 2: PHYSICAL MEASUREMENT VALIDATION (STATE: PROGRESS)
--------------------------------------------------------------------------------
* Step 1: Quantitative Data Capture
  - Increment/Decrement UI component (+ and - signs) to input hazard diameter or circumference metrics.
* Step 2: Business Logic Validation Rules (Hard Bounds)
  - The system must evaluate the numerical input against the selected asset type:
    a. If Type = "Hanger", validated minimum diameter must be >= 2 inches.
    b. If Type = "Leaner", validated minimum diameter must be >= 6 inches.
* Step 3: Audit Photo Attachment
  - Mandatory "Hazard Measurement Photo" explicitly validating the physical measuring tool against the asset.
* State Change: Measure state transitions from Red to Green.

4. PHASE 3: RECONCILIATION & POST-WORK (STATE: RESOLUTION)
--------------------------------------------------------------------------------
* Step 1: Resolution Evidence Capture
  - Mandatory "Post-Work Photo" displaying the clear, remediated area. 
  - UX Guideline: Instruct user to align camera perspective with the historical Pre-Work photo.
* Step 2: Volumetric Quantity Entry
  - Record the absolute unit count (Default system state integer initialized to 1).
* Step 3: Conditional Dropdown Logic
  - If Hazard Type is "Leaner", dynamically show an "Eligibility Criteria" dropdown menu. (Hidden or bypassed if Hazard Type is "Hanger").
* State Change: Post-Work state transitions from Red to Green.

5. PHASE 4: REVIEW, ATTESTATION, AND SUBMISSION
--------------------------------------------------------------------------------
* Step 1: Summary Review Screen
  - Consolidated view of all metadata collected across Phases 1, 2, and 3.
  - Deep-linking enabled on every section to allow rapid jumping back to previous form states.
* Step 2: Legal/Compliance Attestation
  - Submission button triggers a mandatory modal displaying an attestation statement.
  - Requires user interaction via an explicit "I Agree" action before final payload commit.

6. PHYSICAL OUTPUT & TRANSACTION ARCHIVAL (PRINT/RE-PRINT)
--------------------------------------------------------------------------------
* Primary Print Flow: Upon submission, the application queries the remote database to pull down the synchronized record payload and streams it to the local field printer.
* Historical Re-Print Protocol:
  - Accessible directly from the main authenticated interface.
  - Manual Query Key: User enters a unique "Unit Rate Ticket Number".
  - System pulls historical payload data from local cache or remote sync server to re-stream to the printing peripheral.
================================================================================

SYSTEM DESIGN REFERENCE: LHS CREW CERTIFICATION WORKFLOW
===============================================================================

1. DEVICE IDENTITY, ACCESS, & SECURITY
-------------------------------------------------------------------------------
* Authentication: Two-factor entry using a unique Employee/Badge Number and a 
  numeric PIN. 
* System Lockout: Requires an administrative override channel (via supervisor 
  or dedicated support line) if a device is locked.
* Monitoring & Compliance: Continuous remote monitoring of device activity. 
  Personal or unauthorized use (web browsing, texting) triggers a violation.
* Power & Hardware Constraints: Devices must remain powered ON continuously 
  (no hard power-offs) and docked on DC chargers when idle, relying on 
  automated screensavers for power management.

2. CONNECTIVITY & QUEUE MANAGEMENT (FIRST PRINCIPLES)
-------------------------------------------------------------------------------
* Connection State Monitoring: Binary connectivity indicator (Green = Connected, 
  Red = Disconnected).
* Asynchronous Data Handling: System utilizes a background "Pending Upload" 
  queue for files/photos. 
* Data Integrity Rule: Certifications and assets must be aggressively flushed 
  to the server. Users must monitor the queue to ensure it continuously drains 
  to zero. Immediate escalation to a supervisor is triggered if documents stall.

3. STATE-BASED TRANSACTION DATA ENTRY
-------------------------------------------------------------------------------
* Initialization: Created via a standard identifier (scanning a physical barcode 
  or manually entering a unique vehicle/entity number).
* Dynamic Input Validation: UI employs a state-based color indicator system 
  (e.g., Red = Required/Missing Data; Green = Validated/Complete). The main 
  "Complete/Submit" transaction button is locked until all subset modules match 
  the validated green state.
* Core Data Modules Required:
  - Contractor: Primary organization selector with nested Tier 1/Tier 2 
    subcontractor tracking.
  - Driver: Name, contact number, and a mandatory confirmation checkbox 
    indicating a physical current/valid driver's license was cited.
  - Vehicle: Registration tracking (Tag Number, Issuing State, Expiration Date) 
    and a mandatory confirmation checkbox indicating physical proof of insurance 
    was cited and verified.

4. MULTI-ANGLE VISUAL DATA CAPTURE (AUDIT TRAIL)
-------------------------------------------------------------------------------
The workflow enforces a strict 4-point photographic audit trail before submission:
* Front View: Must capture the entire front profile and clearly display the 
  license plate.
* Back/Interior: Must capture the majority of the vehicle's interior cargo area 
  and its back portion.
* Side View: Must capture the entire profile of the vehicle, taken completely 
  straight/level (no skewed angles).
* Driver/Placard: A single photo capturing a fully filled-out, legible 
  identification placard alongside the driver's head and shoulders.
* Quality Gate: The interface must allow users to evaluate clarity immediately and 
  force photo retakes directly over the existing slot if blurred or misaligned.

5. TRANSACTION COMPLETION, ATTESTATION, & PRINTING
-------------------------------------------------------------------------------
* Meta-Data Attribution: The final submission step requires logging secondary 
  actors (e.g., Measurer Monitor ID, Contractor Representative Name).
* Data Review Layer: A unified pre-submission summary screen with deep-linking capabilities that allows users to jump back, edit specific modules, and return seamlessly.
* Legal Attestation: Submission is strictly blocked until the user explicitly 
  interacts with and signs off on an "I Agree" attestation prompt.
* Local Physical Output: Integrates with mobile field printers to pull verified 
  data down from the database and print physical receipts/tickets immediately 
  upon submission.
* Redundancy: The home interface must maintain an independent "Re-Print" utility 
  allowing users to input a past transaction identifier to re-generate physical 
  tickets on demand.
===============================================================================

SYSTEM DESIGN REFERENCE: TRUCK CERTIFICATION - BY VOLUME WORKFLOW
===============================================================================

1. ADDITIONS TO CORE VEHICLE DATA METADATA
-------------------------------------------------------------------------------
* Initialization State: When a vehicle number is scanned or entered, it is 
  explicitly initialized with an empty volumetric profile ("no capacity" state).
* Vehicle Typing: Enforces a structural categorization dropdown list (Vehicle 
  Type) with a fallback user-defined string parameter if "Other" is selected.
* Feature Flags: Requires a Boolean array/checkbox selector to capture 
  physical design features present on the vehicle body.

2. VOLUMETRIC CALCULATION ENGINE (FIRST PRINCIPLES)
-------------------------------------------------------------------------------
The system handles vehicle certification via structural calculation parameters:
* Relational Constraint Management:
  - Supports a hierarchy of measurements categorized as either "Primary" or 
    "Secondary".
  - Strict Rule: Exactly one (1) measurement record is permitted to be flagged 
    as the "Primary Measurement" per vehicle transaction.
* Volumetric Modifiers:
  - System must process dimensional arithmetic through mathematical operators 
    defined by the user: "Addition" or "Subtraction".
  - Constraint Rule: All math records explicitly flagged as the "Primary 
    Measurement" must default strictly to an "Addition" operator.
  - Exception Flags: System must support an active Boolean exception state 
    (e.g., "No Tailgate") which modifies the final volumetric capacity.
* Data Input Formatting (Precision Preservation):
  - Numeric entries for spatial dimensions (Length x Width x Height) must be 
    captured using discrete, separated input structures for Feet and Inches.
  - Developer Note: Do not accept raw float/decimal inputs from users to prevent 
    rounding, unit mismatch, or truncation issues during arithmetic conversion.

3. CORRELATED VISUAL AUDIT GATES
-------------------------------------------------------------------------------
* Feature-Specific Proof: For every independent geometric measurement record 
  added to the engine, the system must force a 1:1 correlated photo capture 
  of that specific physical feature or modification.
* Standard 4-Point Vehicle Photos: Retains the exact visual proof requirements 
  outlined in the baseline crew spec: Front View (with plate), Back/Interior, 
  Side View (level), and a legible Driver/Placard profile combination.

4. STATE VALIDATION & SYSTEM OUTPUT
-------------------------------------------------------------------------------
* Complete-State Lockout: The final submission workflow requires validation of 
  five green states prior to unlocking: Contractor, Driver, Vehicle, Measure, 
  and Photos.
* Pre-Submission Audit & Submission: Retains the deep-linked modification 
  review layer, physical attestation requirement, and downstream printing integrations.
===============================================================================


SYSTEM DESIGN REFERENCE: TRUCK RE-CERTIFICATION WORKFLOW
===============================================================================

1. STATE RETRIEVAL & CLONING LOGIC
-------------------------------------------------------------------------------
* Existing State Fetch: The workflow initializes by reading a past database record 
  via an "Existing Truck Number" input string. 
* Confirmation Gate: Explicitly mandates an unblocked user confirmation step 
  (clicking "OK" on an alert prompt) to commit the historical state download.
* Primary Key Mutation / Re-indexing:
  - System must accept a "New Truck Number" parameter (scanned or typed) immediately 
    following historical record extraction.
  - Architectural Note: This enables migrating an established profile configuration 
    into a completely fresh unique identifier or re-allocated hardware pool.

2. CONDITIONAL STATE OVERRIDES (FIRST PRINCIPLES)
-------------------------------------------------------------------------------
During record cloning, the application layer must support two explicit structural 
re-configurations before passing data into the validation gate:
* Crew Conversion State: If converting/renewing a crew, an explicit Boolean flag 
  ("Make Crew Certification") must be verified and checked to match the logic model 
  of the baseline crew specification.
* Capacity Zeroing Constraint: If updating a truck model to have no allowable volume, 
  an explicit override flag ("Certify Truck at Zero Capacity") must be toggled. 
  This forces the math/measurement ledger to lock downstream to zero cubic units.

3. DATA LAYER MUTATION RIGHTS
-------------------------------------------------------------------------------
Once the historical state payload is loaded and transformed via overrides, the UI 
routes the data into active, mutable modules:
* Measurement Ledger Mutation: Offers complete CRUD capabilities (Create, Read, Update, 
  Delete) over historical geometric calculation arrays.
* Module Verification Layer: Contractor, Driver, and Vehicle objects are loaded 
  as pre-populated fields, enabling optional inspection and field-by-field updates.

4. IDEMPOTENT AUDIT TRAIL AND LOCAL OUTPUT
-------------------------------------------------------------------------------
* Visual Audit Refresh: Despite cloning existing metadata, the system treats 
  visual verification as strictly ephemeral/transactional. Users must fresh-capture 
  the complete 4-point photographic audit trail (Front, Back/Interior, Side, and 
  Driver/Placard combo) for the new record instance.
* Complete-State Gate & Attestation: Requires all operational buttons to turn green 
  prior to finalizing, logging secondary actor metrics, passing through deep-linked 
  reviews, and enforcing an explicit legal attestation signature.
* Local Physical Output: Relies on the same physical thermal receipt infrastructure 
  to dispatch new ticket payloads right to field drivers.
===============================================================================

================================================================================
SYSTEM REFERENCE BLUEPRINT: TICKETING & AUDIT ARCHITECTURE
================================================================================

1. SYSTEM ACCESS & NAVIGATION PARADIGM
--------------------------------------------------------------------------------
* PREREQUISITE: Force client-side version compliance (uninstall legacy versions 
  prior to fresh deployment/updates).
* AUTHENTICATION: Regional/Role-based credential routing (managed via Regional 
  Data Managers).
* CORE LAYOUT: Ribbon-based navigation bar located at the top of the interface. 
  Selecting a top-level module (e.g., "Entry Forms") dynamically transforms 
  the secondary ribbon contextual bar beneath it to display specific object/ticket types.
* DATA DISCOVERY: Every functional form must feature a "Find [Object]" search 
  field with a definitive "GO" action button to populate detailed records.

2. MULTI-MODAL EVENT TICKETING TYPES
--------------------------------------------------------------------------------
The system handles logistics, tracking, and compliance via four foundational 
ticket archetypes, each requiring distinct metadata schemas:

i. Load Ticket (Field Operations)
   - Unique Identifiers: Load Ticket #, Track #
   - Entity Context: Applicant, Disaster/Incident ID, Program Type, Contractor Name
   - Resource Mapping: Driver Name, Truck #, Truck Capacity
   - Geographic Data: ROE/WO (Right of Entry / Work Order), Street Address/Location, Zone #, GPS Coordinates
   - Classification: Debris Classification Matrix (e.g., Construction/Demolition, Vegetative/Woody, Other)
   - Temporal/Audit Logging: Loading Time/Date, Disposal Time/Date
   - Personnel Tracking: Monitor Name & ID (Loading), Monitor Name & ID (Disposal)
   - Validation Metrics: TDSR/Disposal Site Location, Scale Ticket #, Load Call (%), Weight (tons)
   - Transaction Integrity: Explicit confirmation button ("Confirm Load Ticket #") mapped to a target document field ("Replaces VOID doc").

ii. Haulout Ticket (Bulk Logistics & Transport)
   - Identification: Haulout Ticket #
   - Entity Context: Applicant, Disaster ID, Program, Contractor Name
   - Vehicle Mapping: Truck #, Truck Capacity
   - Resource Identity: Driver's Name
   - Origin/Destination: TDSR Site, Disposal Site Location
   - Classification: Debris sub-types (e.g., City/County Vegetative Mulch, Storm 1 Haulout, Vegetative Mulch)
   - Logistics Metrics: Scale Ticket #, Load Call (%), Weight (tons/lbs)
   - Dual-Point Monitoring: Separate fields for Loading Time/Monitor Signature/ID and Disposal Time/Monitor Name/ID.

iii. Unit Rate Ticket (Rate/Service Based Transactions)
   - Identification: Unit Rate Ticket #
   - Operational Scope: Applicant, Disaster, Program, Contractor Name, Crew #
   - Survey Data: Survey Item #, GPS Coordinates, Location Address/Street Name, Zone #
   - Contract Metrics: ROE #, Service Code, Unit Count, Measurement Units
   - Execution Tracking: Start Time, End Time, Date
   - Validation: Monitor Name & ID, Contractor Name, Special Class modifiers

iv. Truck Certification (Asset Management & Auditing)
   - Identification: Truck Certificate #, Truck ID, Capacity
   - General Information: Applicant, Contractor, Tier Classifications, Driver Name/License/Phone, Tag #, Expiration Dates
   - Physical Features: Dump Truck/Trailer Type selectors (e.g., Dump Truck, Hydraulic Dump, Non-Hydraulic, Semi, Self-Loading)
   - Measurement Information Matrix:
     * Primary Dimensions: Interior Length, Width, Height, Volume
     * Geometric Adjustments: Circle "+" additions or "-" deductions (Tape Code, Rounded Bottoms, Truck Vol)
     * Volumetric Calculation: Total cubic yards (CYD) computation block
     * Chain of Custody / Verification: Measured By (Name/ID), Calculated By (Name/ID), Checked By (Name/ID), Signatures (Applicant, Monitor, Contractor).

3. MEDIA VALIDATION & DATA AUDIT INTEGRATION
--------------------------------------------------------------------------------
* MULTI-MEDIA BINDING: Tickets/Truck records natively anchor high-resolution 
  photographs taken directly at the time of creation.
* SUPPLEMENTAL STORAGE: A segmented UI layout tab (e.g., "Supplemental Images") 
  houses operational photos separate from raw text schemas.
* METADATA MUTABILITY: Photographic evidence retains an independent audit layer. 
  Users can change descriptions dynamically via predefined drop-down lists 
  coupled with a strict "Change Description" validation hook.
* CORE STATE MUTATION: Any alterations, edits, or overrides to an existing data 
  record require explicit execution via a bottom-anchored "Submit" or 
  "Confirm [Object]" action to commit mutations to the datastore.
================================================================================

================================================================================
SYSTEM REFERENCE BLUEPRINT: AUDIT DASHBOARD, TRIAGE & ANOMALY ENGINE
================================================================================

1. SYSTEM STATUS & DATA TRIAGE MATRIX (STOPLIGHT PARADIGM)
--------------------------------------------------------------------------------
The dashboard evaluates data integrity across projects using a prioritized 
traffic-light classification and mapping model:

* RED STATUS (Major Issues / Immediate Priority)
  - Severity: Requires immediate architectural or administrative intervention.
  - Corresponding Action Priority: Maps directly to "Urgent" or "High" levels.
* YELLOW STATUS (Important Errors / Daily Clearance)
  - Severity: Operational blockers that must be cleared out daily.
  - Corresponding Action Priority: Maps directly to "Low" priority levels.
* GREEN STATUS (Compliant System State)
  - Severity: No errors detected; no system or manual action required.

2. LOGICAL ERROR DOMAIN TAXONOMY
--------------------------------------------------------------------------------
System errors are partitioned into four distinct operational domains, each 
requiring a specialized escalation path:

i. System Domain
   - Root Causes: Network connectivity issues or duplicate primary key fields 
     (e.g., duplicate ticket numbers).
   - Escalation Vector: Immediate routing to a system supervisor.

ii. Operations Domain
   - Root Causes: Ticket synchronization or reprint failures.

iii. QC (Quality Control) Domain
   - Root Causes: Bulk data gaps, truck certification mismatches, or missing 
     transaction metadata. Represents the highest volume of system alerts.

iv. Anomaly Domain
   - Root Causes: Potential field fraud or behavioral spikes. Triggered when 
     a single field monitor's transactional output significantly outpaces 
     the statistical average of adjacent monitors.
   - Escalation Vector: Field supervisor verification.

3. DISCOVERY, EXPANSION, AND WORKFLOW INTEGRATION
--------------------------------------------------------------------------------
* DRILL-DOWN ARCHITECTURE: Clicking a status indicator reveals a dedicated 
  exceptions page displaying all scoped errors grouped by priority level.
* PROGRESSIVE DISCLOSURE: Errors are nested under "Activity Type" headers. 
  An expansion mechanism (Plus symbol) exposes fine-grained event logs:
  - Error Timestamp (Date of occurrence).
  - Workflow Hyperlinks: "Investigate" and "Mark Completed" (state-overrides).
  - Target Entity: Associated error type and unique ticket/object identifier.
  - Descriptive Summary: A brief contextual trace explaining the failure mode.

4. ERROR MODE RESOLUTION AND FIRST-PRINCIPLE FIXES
--------------------------------------------------------------------------------
When resolving exceptions within the system, the following protocol applies:

* DATE EXCEPTION
  - Failure: Record falls outside project-level temporal boundaries (empty value 
    or skewed client device clock).
  - Resolution: Re-open target record, reconcile the timestamp, and issue 
    a validation check to the remote client device.

* GPS LOCATION EXCEPTION
  - Failure: Geolocation coordinates fall outside defined project geofences 
    or are recorded as blank/null string segments.
  - Resolution: Re-open record and derive correct GPS coordinates using the text 
    address field. If an out-of-bounds coordinate was explicitly captured, 
    escalate to a Project Manager before applying spatial mutations.

* TRUCK / CREW EXCEPTION
  - Failure: Vehicle identifier is unrecognized by the active project schema.
  - Resolution: Evaluate if the payload contains a typographical error, 
    a fresh certification record not yet synchronized to the core database, 
    or cross-project asset pollution. Typographical errors can be edited directly; 
    unregistered or cross-project assets require validation from field 
    monitors or project supervisors.

* MEASURE WARNING
  - Failure: Volumetric or weight data violates project payload safety envelopes.
  - Resolution: Match input to source physical documentation. If valid, 
    escalate to Regional Data Management to adjust project boundary schemas.

* SERVICE CODE WARNING
  - Failure: Applied operational or billing code is missing from the project's 
    lookup tables.
  - Resolution: Verify syntax correctness; escalate to Regional Data Management 
    to append new valid lookups if required.

* TRANSACTION WARNING
  - Failure: Core transaction fails compilation because downstream relational 
    dependencies (e.g., missing metrics, contractors, or codes) are unmet.
  - Resolution: Audit the entity for null attributes, fill required fields, 
    and verify transaction validation engines with Regional Data Management.
================================================================================

================================================================================
SYSTEM REFERENCE BLUEPRINT: PENDING TICKET STATE-RECONCILIATION ENGINE
================================================================================

1. ASYMMETRICAL STATE-MATCHING ARCHITECTURE
--------------------------------------------------------------------------------
The system monitors transactional lifecycle integrity across decoupled field 
nodes by isolating mismatched asynchronous entries into two "Pending" states. 
A unified system design must reconcile these asymmetrical data states:

i. Pending Collection State
   - Definition: A transaction lifecycle has been initialized, opened, or 
     submitted on a Collection Monitor's client endpoint, but contains no 
     corresponding counterpart on the Disposal/Tower endpoint.
   - Sampling SLA: System logs/reports must be audited at minimum once per hour.

ii. Pending Disposal State
   - Definition: A transaction has been finalized, closed, or submitted on a 
     Disposal Monitor's client endpoint, but completely lacks an upstream, 
     matching creation entry from the Collection side.
   - Baseline Exception: Under steady-state operations, this table should 
     remain entirely empty. Brief latency entries (e.g., immediate pull before 
     system pairing) are acceptable but must auto-resolve within minutes.
   - Sampling SLA: System logs/reports must be audited at minimum once per hour.

2. STATE ANOMALY TAXONOMY & RECONCILIATION PROTOCOLS
--------------------------------------------------------------------------------
Pending states alternate between operational variances and system data errors. 
The system logic must classify and handle exceptions according to these criteria:

* LEGITIMATE OPERATIONAL VARIANCES (False Positives)
  - En Route Load: Vehicle is physically transit between nodes. Reconcile by 
    calculating historical turnaround time via aLoadTicket/Export logs.
  - Preload Event: Material collected at the end of an operational shift to be 
    disposed of the following day. Must align with the Collection Monitor's log.
  - Mechanical Failure: Downed transit vehicle preventing disposal arrival. 
    Requires out-of-band monitor or supervisor verification.

* DATA EXCEPTION INTEGRITY ISSUES (System/Human Errors)
  - Multi-Ticket Collisions: Monitors generating duplicate tickets for a singular 
    physical payload. Detected by scanning for identical truck configurations 
    within narrow, overlapping timestamp brackets (points to typo or tandem-rig 
    identification failures).
  - Tower Dropout: Physical disposal occurred, but network dropouts or operator 
    omission prevented disposal record finalization.
  - Form Gaps: Monitored items processed on empty containers or 0% load calls. 
    Strict system constraint: Block 0% load assignments to prevent downstream 
    reporting skew.
  - Field Disconnect / Lost Entries: A ticket is passed to a driver but never 
    submitted by the collection device. 
    * Resolution Workflow: If the node is active at the source location, require 
      immediate mobile submission. If the node has moved, system administrators 
      must manually inject the field log address and fetch static coordinates 
      via mapping APIs (Google Maps/Geoportal) to overwrite RT Desktop.

3. DISCOVERY, DATA CORRECTION, AND "MARRYING" LOGIC
--------------------------------------------------------------------------------
* MATCHING PATTERN ENGINE: Cross-reference the Pending Collection and Pending 
  Disposal tables. Identify matching signatures where manual string manipulation 
  introduced errors (e.g., misspelled truck plates, mistyped ticket indices, or 
  scanned tickets differing from physical handouts).
* RECONCILIATION UNION ("MARRYING"): When matches are identified with mutated 
  attributes, the UI/system must enable a merge capability to tie the records 
  together using verified, schema-compliant information.
* INTERFACE SYNCHRONIZATION DISCREPANCY:
  - High-Speed Management Interface (RT Desktop/MobileTickets): Provides rapid 
    tabular interaction and grid updates for data managers.
  - Factual Auditing Interface (RTR Directory): Imposes strict temporal validity. 
    System rule: Interface timestamp readouts on the high-speed interface are 
    inherently non-binding; precise temporal logging must be verified via RTR 
    reporting directories.

4. CRITICAL STATE OVERRIDES & DELETION PROVISIONING
--------------------------------------------------------------------------------
* RESTRICTED STATE CHANGE: Data Managers cannot natively execute deletions or hard 
  mutations on completed/erroneous pending data rows from the UI layer.
* ESCALATION PROTOCOL: Deletion requests must bypass client application layers 
  and route directly to dedicated database administrators (e.g., SQL Strike Team).
* AUDIT TRAIL LOGGING: Every system override request requires:
  - An structured data manifest containing Project Name, Target Pending Ticket #, 
    and explicit, audited Reason Notes (e.g., "Ticket Completed Twice Due to 
    Printer Issue", "Issued in Error").
  - Persistent document tracking: The manifest must be permanently archived 
    within the project's external version-controlled storage environment (Box).
================================================================================

================================================================================
GEOSPATIAL TICKETING & AUDIT SYSTEM DESIGN REQUIREMENTS
================================================================================

1. CORE SYSTEM CAPABILITIES (MAP & DATA VISUALIZATION)
--------------------------------------------------------------------------------
* Multi-Tenant Isolation: Each project/client deployment requires unique access 
  credentials (URL, Username, Password) to secure sensitive operational data.
* Dynamic Visual Layering: The core map interface must support standard basemaps 
  (Satellite, Streets, Topo, Grayscale) overlayed with real-time operational data.
* Spatial Feature Layer Toggling: Users must be able to toggle on/off:
  - Mobile Assets: Real-time telemetry (Truck and Field Crew GPS locations).
  - Transactional Entities: Point-source ticket markers (Load Pickup Locations, 
    Load/Debris Collection Tickets, Hazard Removal Tickets).
  - Spatial Constraints: Polygons representing Project Zones and Boundaries.
  - Client Infrastructure: Polyline data detailing maintenance/road ownership 
    types (e.g., City, County, State, Private, Federal).
* Unified Search: A single global search mechanism to instantly locate spatial 
  or textual data via strict alphanumeric strings (Ticket Numbers), physical 
  addresses, or raw GPS coordinates (Latitude/Longitude).

2. SPATIAL DATA EXTRACTION & ANALYSIS
--------------------------------------------------------------------------------
* Geometric Area Selection (Spatial Querying): Users need ad-hoc tools to bound 
  and query real-time transactional points within a physical area via:
  - Polygon Tool: Multi-point precise geometric boundary mapping.
  - Lasso Tool: Free-hand click-and-drag area capturing.
* Structured Bulk Export: System must calculate point counts inside the 
  selected geometry and offer a native bulk export to structured flat files 
  (CSV, GeoJSON) mapped to specific active feature layers.

3. DATA ARCHITECTURE & TAXONOMY (REFERENCE METADATA)
--------------------------------------------------------------------------------
* Mobile Asset Payload:
  - SystemID, DisasterID, ClientID, ProjectID
  - Unique Asset/Vehicle Tracking ID (TrkNo)
* Ticket/Incident Payload:
  - Global Unique Identifier (Ticket Number)
  - Core Classification Categories (e.g., Debris Class: Vegetative/Woody vs. 
    Construction & Demolition; Hazard Type: Hanger, Leaner, White Goods)
  - Contextual Metadata: Tracking ID, GPS Coordinates, Timestamp, Spatial 
    Boundaries/Zones intersected upon creation.

4. FIRST PRINCIPLES FOR OPERATIONAL AUDITING (THE HUMAN-IN-THE-LOOP ENGINE)
--------------------------------------------------------------------------------
* High-Frequency Cadence: The auditing cadence must occur at near real-time, hourly 
  intervals to act as an active defensive guardrail against system anomalies.
* The Boundary Compliance Rule: Every asset telemetry ping and ticket generation 
  point must continuously evaluate against the active Project Boundary and Approved 
  Road Polyline schemas. 
* Incident Escalation Triaging: When an out-of-bounds/unauthorized anomaly occurs, 
  the platform must support distinct escalation paths based on object types:
  
  A. Real-Time Telemetry Violation (e.g., Truck/Crew in unauthorized zone):
     - Action: Immediate peer-to-peer field escalation (Field Supervisor or Project 
       Manager contact) to re-route the asset before data transactions occur.
       
  B. Static Transaction Violation - Unverified Location (e.g., Pickup location error):
     - Action: Promptly contact field hierarchy to check for undocumented client 
       authorizations. If a pure data error is confirmed, trigger an immediate data 
       exception alert to the Data Management tier including the Ticket ID and GPS data.
       
  C. Static Transaction Violation - Structural Data Error (e.g., Invalid Collection GPS):
     - Action: Queue the transaction for spatial transformation. Collect the error parameters 
       (Ticket ID, Project, Date, Old Address/GPS, New Address/GPS) into a batch correction schema.
       
* Asynchronous Rectification: Execute systemic data-clearing scripts asynchronously 
  (e.g., nightly batch processing) to correct faulty coordinates, followed by a mandatory 
  re-verification audit by the human operator the following morning.
================================================================================


