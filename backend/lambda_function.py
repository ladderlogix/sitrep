import json
import boto3
import uuid
import time
import os
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
findings_table = dynamodb.Table(os.environ.get("FINDINGS_TABLE", "SitRepFindings"))
notes_table = dynamodb.Table(os.environ.get("NOTES_TABLE", "SitRepNotes"))
timeline_table = dynamodb.Table(os.environ.get("TIMELINE_TABLE", "SitRepTimeline"))
mitre_table = dynamodb.Table(os.environ.get("MITRE_TABLE", "SitRepMitre"))

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o) if o % 1 else int(o)
        return super().default(o)


def respond(status, body):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def lambda_handler(event, context):
    method = event.get("httpMethod", "")
    path = event.get("path", "")
    body = json.loads(event.get("body") or "{}")
    qs = event.get("queryStringParameters") or {}

    if method == "OPTIONS":
        return respond(200, {"message": "ok"})

    try:
        # ── Findings ──
        if path == "/api/findings" and method == "GET":
            return get_findings(qs)
        if path == "/api/findings" and method == "POST":
            return create_finding(body)
        if path.startswith("/api/findings/") and method == "GET":
            return get_finding(path.split("/")[-1])
        if path.startswith("/api/findings/") and method == "PUT":
            return update_finding(path.split("/")[-1], body)
        if path.startswith("/api/findings/") and method == "DELETE":
            return delete_finding(path.split("/")[-1])

        # ── Notes (agent query paths) ──
        if path == "/api/notes" and method == "GET":
            return get_notes(qs)
        if path == "/api/notes" and method == "POST":
            return create_note(body)
        if path.startswith("/api/notes/") and method == "GET":
            return get_note(path.split("/")[-1])
        if path.startswith("/api/notes/") and method == "DELETE":
            return delete_note(path.split("/")[-1])

        # ── Challenges (aggregated view) ──
        if path == "/api/challenges" and method == "GET":
            return get_challenges()

        # ── Timeline ──
        if path == "/api/timeline" and method == "GET":
            return get_timeline_events(qs)
        if path == "/api/timeline" and method == "POST":
            return create_timeline_event(body)
        if path.startswith("/api/timeline/") and method == "GET":
            return get_timeline_event(path.split("/")[-1])
        if path.startswith("/api/timeline/") and method == "PUT":
            return update_timeline_event(path.split("/")[-1], body)
        if path.startswith("/api/timeline/") and method == "DELETE":
            return delete_timeline_event(path.split("/")[-1])

        # ── MITRE ATT&CK ──
        if path == "/api/mitre" and method == "GET":
            return get_mitre_mappings(qs)
        if path == "/api/mitre" and method == "POST":
            return create_mitre_mapping(body)
        if path.startswith("/api/mitre/") and method == "GET":
            return get_mitre_mapping(path.split("/")[-1])
        if path.startswith("/api/mitre/") and method == "PUT":
            return update_mitre_mapping(path.split("/")[-1], body)
        if path.startswith("/api/mitre/") and method == "DELETE":
            return delete_mitre_mapping(path.split("/")[-1])

        # ── Search ──
        if path == "/api/search" and method == "GET":
            return search_all(qs)

        # ── Stats ──
        if path == "/api/stats" and method == "GET":
            return get_stats()

        # ── Agent Prompt ──
        if path == "/api/agent-prompt" and method == "GET":
            return get_agent_prompt()

        return respond(404, {"error": "Not found"})
    except Exception as e:
        return respond(500, {"error": str(e)})


# ────────────────────────── Findings ──────────────────────────


def get_findings(qs):
    params = {}
    filter_expressions = []

    if qs.get("challenge"):
        filter_expressions.append(Attr("challenge_name").eq(qs["challenge"]))
    if qs.get("agent_id"):
        filter_expressions.append(Attr("agent_id").eq(qs["agent_id"]))
    if qs.get("category"):
        filter_expressions.append(Attr("category").eq(qs["category"]))
    if qs.get("status"):
        filter_expressions.append(Attr("status").eq(qs["status"]))
    if qs.get("finding_type"):
        filter_expressions.append(Attr("finding_type").eq(qs["finding_type"]))

    if filter_expressions:
        combined = filter_expressions[0]
        for f in filter_expressions[1:]:
            combined = combined & f
        params["FilterExpression"] = combined

    result = findings_table.scan(**params)
    items = sorted(result["Items"], key=lambda x: x.get("timestamp", 0), reverse=True)
    return respond(200, {"findings": items, "count": len(items)})


def create_finding(body):
    required = ["challenge_name", "agent_id", "title", "content"]
    for field in required:
        if field not in body:
            return respond(400, {"error": f"Missing required field: {field}"})

    item = {
        "id": str(uuid.uuid4()),
        "challenge_name": body["challenge_name"],
        "agent_id": body["agent_id"],
        "finding_type": body.get("finding_type", "clue"),
        "category": body.get("category", "general"),
        "title": body["title"],
        "content": body["content"],
        "tags": body.get("tags", []),
        "status": body.get("status", "investigating"),
        "severity": body.get("severity", "medium"),
        "evidence": body.get("evidence", []),
        "timestamp": int(time.time()),
        "updated_at": int(time.time()),
    }
    findings_table.put_item(Item=item)
    return respond(201, {"finding": item})


def get_finding(finding_id):
    result = findings_table.get_item(Key={"id": finding_id})
    item = result.get("Item")
    if not item:
        return respond(404, {"error": "Finding not found"})
    return respond(200, {"finding": item})


def update_finding(finding_id, body):
    update_expr_parts = []
    expr_values = {}
    expr_names = {}

    allowed = [
        "title", "content", "status", "finding_type", "category",
        "tags", "severity", "evidence", "challenge_name",
    ]
    for field in allowed:
        if field in body:
            safe_name = f"#{field}"
            safe_val = f":{field}"
            update_expr_parts.append(f"{safe_name} = {safe_val}")
            expr_names[safe_name] = field
            expr_values[safe_val] = body[field]

    update_expr_parts.append("#updated_at = :updated_at")
    expr_names["#updated_at"] = "updated_at"
    expr_values[":updated_at"] = int(time.time())

    result = findings_table.update_item(
        Key={"id": finding_id},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return respond(200, {"finding": result["Attributes"]})


def delete_finding(finding_id):
    findings_table.delete_item(Key={"id": finding_id})
    return respond(200, {"message": "Finding deleted"})


# ────────────────────────── Notes ──────────────────────────


def get_notes(qs):
    params = {}
    filter_expressions = []

    if qs.get("challenge"):
        filter_expressions.append(Attr("challenge_name").eq(qs["challenge"]))
    if qs.get("agent_id"):
        filter_expressions.append(Attr("agent_id").eq(qs["agent_id"]))

    if filter_expressions:
        combined = filter_expressions[0]
        for f in filter_expressions[1:]:
            combined = combined & f
        params["FilterExpression"] = combined

    result = notes_table.scan(**params)
    items = sorted(result["Items"], key=lambda x: x.get("timestamp", 0), reverse=True)
    return respond(200, {"notes": items, "count": len(items)})


def create_note(body):
    required = ["challenge_name", "agent_id", "title"]
    for field in required:
        if field not in body:
            return respond(400, {"error": f"Missing required field: {field}"})

    item = {
        "id": str(uuid.uuid4()),
        "challenge_name": body["challenge_name"],
        "agent_id": body["agent_id"],
        "title": body["title"],
        "query_path": body.get("query_path", []),
        "methodology": body.get("methodology", ""),
        "tools_used": body.get("tools_used", []),
        "commands_run": body.get("commands_run", []),
        "flag_found": body.get("flag_found", ""),
        "key_observations": body.get("key_observations", []),
        "dead_ends": body.get("dead_ends", []),
        "next_steps": body.get("next_steps", []),
        "artifacts": body.get("artifacts", []),
        "timestamp": int(time.time()),
    }
    notes_table.put_item(Item=item)
    return respond(201, {"note": item})


def get_note(note_id):
    result = notes_table.get_item(Key={"id": note_id})
    item = result.get("Item")
    if not item:
        return respond(404, {"error": "Note not found"})
    return respond(200, {"note": item})


def delete_note(note_id):
    notes_table.delete_item(Key={"id": note_id})
    return respond(200, {"message": "Note deleted"})


# ────────────────────────── Challenges ──────────────────────────


def get_challenges():
    """Aggregate findings and notes into a per-challenge view."""
    findings = findings_table.scan()["Items"]
    notes = notes_table.scan()["Items"]

    challenges = {}
    for f in findings:
        name = f.get("challenge_name", "Unknown")
        if name not in challenges:
            challenges[name] = {
                "challenge_name": name,
                "categories": set(),
                "flags": [],
                "findings_count": 0,
                "notes_count": 0,
                "agents": set(),
                "status": "investigating",
                "key_findings": [],
            }
        ch = challenges[name]
        ch["findings_count"] += 1
        ch["categories"].add(f.get("category", "general"))
        ch["agents"].add(f.get("agent_id", ""))
        if f.get("finding_type") == "flag":
            ch["flags"].append({
                "title": f.get("title", ""),
                "content": f.get("content", ""),
                "agent_id": f.get("agent_id", ""),
                "timestamp": f.get("timestamp", 0),
            })
            ch["status"] = "solved"
        ch["key_findings"].append({
            "id": f.get("id"),
            "title": f.get("title", ""),
            "finding_type": f.get("finding_type", ""),
            "status": f.get("status", ""),
            "content": f.get("content", "")[:200],
        })

    for n in notes:
        name = n.get("challenge_name", "Unknown")
        if name not in challenges:
            challenges[name] = {
                "challenge_name": name,
                "categories": set(),
                "flags": [],
                "findings_count": 0,
                "notes_count": 0,
                "agents": set(),
                "status": "investigating",
                "key_findings": [],
            }
        ch = challenges[name]
        ch["notes_count"] += 1
        ch["agents"].add(n.get("agent_id", ""))
        if n.get("flag_found"):
            ch["flags"].append({
                "flag": n["flag_found"],
                "title": n.get("title", ""),
                "methodology": n.get("methodology", ""),
                "query_path": n.get("query_path", []),
                "tools_used": n.get("tools_used", []),
                "agent_id": n.get("agent_id", ""),
                "timestamp": n.get("timestamp", 0),
            })
            ch["status"] = "solved"

    # Convert sets to lists for JSON serialization
    result = []
    for ch in challenges.values():
        ch["categories"] = sorted(list(ch["categories"]))
        ch["agents"] = sorted(list(ch["agents"]))
        result.append(ch)

    result.sort(key=lambda x: x["challenge_name"])
    return respond(200, {"challenges": result, "count": len(result)})


# ────────────────────────── Timeline ──────────────────────────


def get_timeline_events(qs):
    params = {}
    filter_expressions = []

    if qs.get("challenge"):
        filter_expressions.append(Attr("challenge_name").eq(qs["challenge"]))
    if qs.get("event_type"):
        filter_expressions.append(Attr("event_type").eq(qs["event_type"]))

    if filter_expressions:
        combined = filter_expressions[0]
        for f in filter_expressions[1:]:
            combined = combined & f
        params["FilterExpression"] = combined

    result = timeline_table.scan(**params)
    items = sorted(result["Items"], key=lambda x: x.get("event_time", ""), reverse=False)
    return respond(200, {"events": items, "count": len(items)})


def create_timeline_event(body):
    required = ["title", "event_time"]
    for field in required:
        if field not in body:
            return respond(400, {"error": f"Missing required field: {field}"})

    item = {
        "id": str(uuid.uuid4()),
        "title": body["title"],
        "description": body.get("description", ""),
        "event_time": body["event_time"],
        "event_type": body.get("event_type", "incident"),
        "severity": body.get("severity", "medium"),
        "challenge_name": body.get("challenge_name", ""),
        "agent_id": body.get("agent_id", ""),
        "source": body.get("source", ""),
        "artifacts": body.get("artifacts", []),
        "related_finding_ids": body.get("related_finding_ids", []),
        "mitre_technique_ids": body.get("mitre_technique_ids", []),
        "tags": body.get("tags", []),
        "timestamp": int(time.time()),
    }
    timeline_table.put_item(Item=item)
    return respond(201, {"event": item})


def get_timeline_event(event_id):
    result = timeline_table.get_item(Key={"id": event_id})
    item = result.get("Item")
    if not item:
        return respond(404, {"error": "Timeline event not found"})
    return respond(200, {"event": item})


def update_timeline_event(event_id, body):
    update_expr_parts = []
    expr_values = {}
    expr_names = {}

    allowed = [
        "title", "description", "event_time", "event_type", "severity",
        "challenge_name", "source", "artifacts", "related_finding_ids",
        "mitre_technique_ids", "tags",
    ]
    for field in allowed:
        if field in body:
            safe_name = f"#{field}"
            safe_val = f":{field}"
            update_expr_parts.append(f"{safe_name} = {safe_val}")
            expr_names[safe_name] = field
            expr_values[safe_val] = body[field]

    if not update_expr_parts:
        return respond(400, {"error": "No fields to update"})

    result = timeline_table.update_item(
        Key={"id": event_id},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return respond(200, {"event": result["Attributes"]})


def delete_timeline_event(event_id):
    timeline_table.delete_item(Key={"id": event_id})
    return respond(200, {"message": "Timeline event deleted"})


# ────────────────────────── MITRE ATT&CK ──────────────────────────


def get_mitre_mappings(qs):
    params = {}
    filter_expressions = []

    if qs.get("tactic"):
        filter_expressions.append(Attr("tactic").eq(qs["tactic"]))
    if qs.get("challenge"):
        filter_expressions.append(Attr("challenge_name").eq(qs["challenge"]))

    if filter_expressions:
        combined = filter_expressions[0]
        for f in filter_expressions[1:]:
            combined = combined & f
        params["FilterExpression"] = combined

    result = mitre_table.scan(**params)
    items = sorted(result["Items"], key=lambda x: x.get("tactic", ""))
    return respond(200, {"mappings": items, "count": len(items)})


def create_mitre_mapping(body):
    required = ["technique_id", "technique_name", "tactic"]
    for field in required:
        if field not in body:
            return respond(400, {"error": f"Missing required field: {field}"})

    item = {
        "id": str(uuid.uuid4()),
        "technique_id": body["technique_id"],
        "technique_name": body["technique_name"],
        "tactic": body["tactic"],
        "sub_technique_id": body.get("sub_technique_id", ""),
        "sub_technique_name": body.get("sub_technique_name", ""),
        "description": body.get("description", ""),
        "observed_evidence": body.get("observed_evidence", ""),
        "challenge_name": body.get("challenge_name", ""),
        "agent_id": body.get("agent_id", ""),
        "related_finding_ids": body.get("related_finding_ids", []),
        "confidence": body.get("confidence", "medium"),
        "tags": body.get("tags", []),
        "timestamp": int(time.time()),
    }
    mitre_table.put_item(Item=item)
    return respond(201, {"mapping": item})


def get_mitre_mapping(mapping_id):
    result = mitre_table.get_item(Key={"id": mapping_id})
    item = result.get("Item")
    if not item:
        return respond(404, {"error": "MITRE mapping not found"})
    return respond(200, {"mapping": item})


def update_mitre_mapping(mapping_id, body):
    update_expr_parts = []
    expr_values = {}
    expr_names = {}

    allowed = [
        "technique_id", "technique_name", "tactic", "sub_technique_id",
        "sub_technique_name", "description", "observed_evidence",
        "challenge_name", "related_finding_ids", "confidence", "tags",
    ]
    for field in allowed:
        if field in body:
            safe_name = f"#{field}"
            safe_val = f":{field}"
            update_expr_parts.append(f"{safe_name} = {safe_val}")
            expr_names[safe_name] = field
            expr_values[safe_val] = body[field]

    if not update_expr_parts:
        return respond(400, {"error": "No fields to update"})

    result = mitre_table.update_item(
        Key={"id": mapping_id},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return respond(200, {"mapping": result["Attributes"]})


def delete_mitre_mapping(mapping_id):
    mitre_table.delete_item(Key={"id": mapping_id})
    return respond(200, {"message": "MITRE mapping deleted"})


# ────────────────────────── Search ──────────────────────────


def search_all(qs):
    query = qs.get("q", "").lower()
    if not query:
        return respond(400, {"error": "Missing search query parameter 'q'"})

    # Search findings
    findings_result = findings_table.scan()
    matched_findings = []
    for item in findings_result["Items"]:
        searchable = " ".join([
            str(item.get("title", "")),
            str(item.get("content", "")),
            str(item.get("challenge_name", "")),
            str(item.get("agent_id", "")),
            str(item.get("category", "")),
            " ".join(item.get("tags", [])),
        ]).lower()
        if query in searchable:
            matched_findings.append(item)

    # Search notes
    notes_result = notes_table.scan()
    matched_notes = []
    for item in notes_result["Items"]:
        searchable = " ".join([
            str(item.get("title", "")),
            str(item.get("methodology", "")),
            str(item.get("challenge_name", "")),
            str(item.get("agent_id", "")),
            str(item.get("flag_found", "")),
            " ".join(item.get("tools_used", [])),
            " ".join([str(s) for s in item.get("query_path", [])]),
            " ".join(item.get("key_observations", [])),
        ]).lower()
        if query in searchable:
            matched_notes.append(item)

    return respond(200, {
        "query": query,
        "findings": sorted(matched_findings, key=lambda x: x.get("timestamp", 0), reverse=True),
        "notes": sorted(matched_notes, key=lambda x: x.get("timestamp", 0), reverse=True),
        "total": len(matched_findings) + len(matched_notes),
    })


# ────────────────────────── Stats ──────────────────────────


def get_stats():
    findings = findings_table.scan()["Items"]
    notes = notes_table.scan()["Items"]

    challenges = set()
    agents = set()
    flags_found = 0
    categories = {}
    statuses = {}
    finding_types = {}

    for f in findings:
        challenges.add(f.get("challenge_name", ""))
        agents.add(f.get("agent_id", ""))
        cat = f.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
        status = f.get("status", "unknown")
        statuses[status] = statuses.get(status, 0) + 1
        ft = f.get("finding_type", "unknown")
        finding_types[ft] = finding_types.get(ft, 0) + 1
        if f.get("finding_type") == "flag":
            flags_found += 1

    for n in notes:
        challenges.add(n.get("challenge_name", ""))
        agents.add(n.get("agent_id", ""))
        if n.get("flag_found"):
            flags_found += 1

    return respond(200, {
        "total_findings": len(findings),
        "total_notes": len(notes),
        "total_challenges": len(challenges),
        "active_agents": len(agents),
        "flags_found": flags_found,
        "categories": categories,
        "statuses": statuses,
        "finding_types": finding_types,
        "challenges": sorted(list(challenges)),
        "agents": sorted(list(agents)),
    })


# ────────────────────────── Agent Prompt ──────────────────────────


def get_agent_prompt():
    prompt = {
        "system_prompt": AGENT_SYSTEM_PROMPT,
        "api_reference": API_REFERENCE,
    }
    return respond(200, prompt)


AGENT_SYSTEM_PROMPT = """
# SitRep CTF Agent Instructions

You are an AI agent participating in a Capture The Flag (CTF) cyber incident investigation.
You have access to the SitRep central repository API to collaborate with other agents.

## Your Role
- Investigate the cyber incident methodically
- Document ALL findings, clues, artifacts, and flags to the central repo
- Record your investigation path (queries, commands, reasoning) as notes
- Check existing findings from other agents before duplicating work
- Mark dead ends so other agents don't waste time

## How to Use the SitRep API

Base URL: PROVIDED_AT_DEPLOYMENT

### 1. Before Starting — Check What Exists
GET /api/stats — overview of all findings and active challenges
GET /api/findings?challenge=CHALLENGE_NAME — see what's already been found
GET /api/notes?challenge=CHALLENGE_NAME — see investigation paths taken

### 2. Log Your Findings
POST /api/findings
{
    "challenge_name": "Name of the CTF challenge",
    "agent_id": "your-unique-agent-id",
    "title": "Brief descriptive title",
    "content": "Detailed description of what you found",
    "finding_type": "flag|clue|artifact|timeline_event|ioc|vulnerability",
    "category": "forensics|web|crypto|reversing|pwn|misc|network|osint|steganography",
    "tags": ["relevant", "tags"],
    "status": "confirmed|investigating|dead_end",
    "severity": "critical|high|medium|low|info",
    "evidence": ["base64 encoded evidence", "file paths", "screenshots"]
}

### 3. Document Your Investigation Path
POST /api/notes
{
    "challenge_name": "Name of the CTF challenge",
    "agent_id": "your-unique-agent-id",
    "title": "Investigation of X via Y approach",
    "query_path": [
        {"step": 1, "action": "Examined pcap file", "result": "Found suspicious DNS queries"},
        {"step": 2, "action": "Filtered DNS for TXT records", "result": "Found base64 encoded data"},
        {"step": 3, "action": "Decoded base64", "result": "Revealed flag format"}
    ],
    "methodology": "Network traffic analysis focusing on DNS exfiltration",
    "tools_used": ["wireshark", "tshark", "base64", "cyberchef"],
    "commands_run": ["tshark -r capture.pcap -Y 'dns.qry.type == 16'"],
    "flag_found": "flag{dns_3xf1l_d3t3ct3d}",
    "key_observations": ["Attacker used DNS TXT records for data exfiltration"],
    "dead_ends": ["Initially checked HTTP traffic - no relevant findings"],
    "next_steps": ["Check if same DNS pattern appears in other challenges"],
    "artifacts": ["decoded_payload.bin", "filtered_dns.csv"]
}

### 4. Log Timeline Events
POST /api/timeline
{
    "title": "Malicious DNS queries begin",
    "event_time": "2025-03-15T14:30:00Z",
    "event_type": "initial_access|execution|persistence|exfiltration|lateral_movement|discovery|c2|impact|detection|response",
    "description": "First observed DNS TXT queries to C2 domain",
    "severity": "high",
    "challenge_name": "Name of the CTF challenge",
    "agent_id": "your-unique-agent-id",
    "source": "pcap analysis",
    "mitre_technique_ids": ["T1071.004"]
}

### 5. Map to MITRE ATT&CK
POST /api/mitre
{
    "technique_id": "T1071",
    "technique_name": "Application Layer Protocol",
    "tactic": "command-and-control",
    "sub_technique_id": "T1071.004",
    "sub_technique_name": "DNS",
    "description": "Attacker used DNS TXT records for C2 communication",
    "observed_evidence": "DNS queries to evil.example.com with base64 TXT responses",
    "challenge_name": "Name of the CTF challenge",
    "confidence": "high|medium|low"
}

### 6. Update Findings as You Learn More
PUT /api/findings/{id}
{ "status": "confirmed", "content": "Updated with new evidence..." }

### 7. Search Across All Data
GET /api/search?q=search_term

### 8. View Challenges Summary
GET /api/challenges — aggregated view of all challenges with flags and solve status

## Best Practices
1. Use a consistent agent_id across all your submissions
2. Always check GET /api/findings first to avoid duplicate work
3. Log dead ends — they save other agents time
4. Use specific finding_types: flag for captured flags, clue for leads, artifact for files/data
5. Include exact commands and tool outputs in your notes
6. Tag IOCs (indicators of compromise) consistently
7. Update status to "confirmed" once validated, "dead_end" if it leads nowhere
8. Cross-reference findings from other agents when building on their work
"""

API_REFERENCE = {
    "endpoints": [
        {"method": "GET", "path": "/api/findings", "params": "challenge, agent_id, category, status, finding_type", "description": "List findings with optional filters"},
        {"method": "POST", "path": "/api/findings", "description": "Create a new finding"},
        {"method": "GET", "path": "/api/findings/{id}", "description": "Get a specific finding"},
        {"method": "PUT", "path": "/api/findings/{id}", "description": "Update a finding"},
        {"method": "DELETE", "path": "/api/findings/{id}", "description": "Delete a finding"},
        {"method": "GET", "path": "/api/notes", "params": "challenge, agent_id", "description": "List agent notes"},
        {"method": "POST", "path": "/api/notes", "description": "Create a new investigation note"},
        {"method": "GET", "path": "/api/notes/{id}", "description": "Get a specific note"},
        {"method": "DELETE", "path": "/api/notes/{id}", "description": "Delete a note"},
        {"method": "GET", "path": "/api/challenges", "description": "Aggregated challenge view with flags, agents, solve status"},
        {"method": "GET", "path": "/api/timeline", "params": "challenge, event_type", "description": "List timeline events"},
        {"method": "POST", "path": "/api/timeline", "description": "Create a timeline event"},
        {"method": "GET", "path": "/api/timeline/{id}", "description": "Get a specific timeline event"},
        {"method": "PUT", "path": "/api/timeline/{id}", "description": "Update a timeline event"},
        {"method": "DELETE", "path": "/api/timeline/{id}", "description": "Delete a timeline event"},
        {"method": "GET", "path": "/api/mitre", "params": "tactic, challenge", "description": "List MITRE ATT&CK mappings"},
        {"method": "POST", "path": "/api/mitre", "description": "Create a MITRE ATT&CK mapping"},
        {"method": "GET", "path": "/api/mitre/{id}", "description": "Get a specific MITRE mapping"},
        {"method": "PUT", "path": "/api/mitre/{id}", "description": "Update a MITRE mapping"},
        {"method": "DELETE", "path": "/api/mitre/{id}", "description": "Delete a MITRE mapping"},
        {"method": "GET", "path": "/api/search?q=term", "description": "Full-text search across findings and notes"},
        {"method": "GET", "path": "/api/stats", "description": "Dashboard statistics"},
        {"method": "GET", "path": "/api/agent-prompt", "description": "Get the agent system prompt and API reference"},
    ]
}
