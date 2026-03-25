import random


def generate_responses(config: dict, total_count: int) -> list[dict]:
    """
    Generate a shuffled list of response payloads from a distribution config.

    config shape:
    {
        "entry.123456": {
            "type": "multiple_choice",
            "distribution": {"Option A": 60, "Option B": 40}
        },
        ...
    }

    Returns a list of dicts like:
    [{"entry.123456": "Option A", "entry.789": "Option B"}, ...]
    """
    # Build per-question response lists based on distribution percentages
    question_responses: dict[str, list] = {}

    for entry_key, question_config in config.items():
        distribution = question_config.get("distribution", {})
        q_type = question_config.get("type", "multiple_choice")
        responses: list = []

        if not distribution:
            continue

        total_weight = sum(distribution.values())
        for option, weight in distribution.items():
            count = round(total_count * weight / total_weight)
            if q_type == "checkbox":
                responses.extend([[option]] * count)
            else:
                responses.extend([option] * count)

        # Pad or trim to exactly total_count
        while len(responses) < total_count:
            responses.append(responses[-1])
        responses = responses[:total_count]

        random.shuffle(responses)
        question_responses[entry_key] = responses

    # Zip all questions together into per-submission payloads
    result = []
    for i in range(total_count):
        payload = {}
        for entry_key, responses in question_responses.items():
            payload[entry_key] = responses[i]
        result.append(payload)

    return result
