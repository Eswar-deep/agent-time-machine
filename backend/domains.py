"""Small domain dispatch; shared recording, storage, lineage and model adapter."""
from . import agent, coding, environment, evaluator, scenarios


def domain_for_scenario(scenario_id):
    return "coding" if scenario_id in coding.scenarios() else "retail"


def scenario(scenario_id):
    if scenario_id in coding.scenarios():
        return coding.scenarios()[scenario_id]
    return {**scenarios.scenario(scenario_id), "domain": "retail"}


def catalog():
    return [*coding.scenarios().values(), *[{**value, "domain": "retail"} for value in scenarios.SCENARIOS.values()]]


def restore_environment(domain, state):
    if domain == "coding":
        return coding.CodingEnvironment(state)
    if domain == "retail":
        return environment.RetailEnvironment(state)
    raise ValueError("Unsupported execution domain.")


def fresh_environment(scenario_id):
    domain = domain_for_scenario(scenario_id)
    return restore_environment(domain, coding.initial_state() if domain == "coding" else scenarios.initial_state())


def compatibility(domain):
    if domain == "coding":
        return coding.compatibility()
    if domain == "retail":
        return environment.compatibility()
    raise ValueError("Unsupported execution domain.")


def policy(domain):
    return coding.POLICY if domain == "coding" else environment.POLICY


def next_action(domain, scenario_id, state, messages):
    return coding.next_action(scenario_id, state, messages) if domain == "coding" else agent.next_demo_action(scenario_id, state, messages)


def final_message(domain, messages):
    return coding.final_message(messages) if domain == "coding" else agent.demo_final(messages)


def evaluate(run, env):
    if run.get("domain", "retail") == "coding":
        run["verification"] = env.verify()
        run["file_diffs"] = coding.file_diffs(run["initial_state"]["files"], run["final_state"]["files"])
        if run["verification"].get("completed") is not True:
            run["execution"] = "failed"
            run["error"] = (run.get("error") or run["verification"].get("error")
                            or "Protected verification did not complete. No successful outcome is claimed.")
        return coding.evaluate(run, run["verification"])
    return evaluator.evaluate(run["scenario_id"], run["initial_state"], run["final_state"], run["events"], run["execution"])


def comparable_observation(domain, observation):
    if domain != "coding":
        return observation
    volatile = {"duration_ms", "latency_ms", "elapsed_ms"}
    def stable(value):
        if isinstance(value, dict):
            return {key: stable(item) for key, item in value.items() if key not in volatile}
        if isinstance(value, list):
            return [stable(item) for item in value]
        return value
    return stable(observation)

