"""The name splitter. It runs on every pasted crew list, so its edges matter."""
from __future__ import annotations

from app.names import apply_name, split_name


def test_a_plain_first_and_last():
    assert split_name("Jordan Miller") == {
        "first_name": "Jordan", "middle_name": None, "last_name": "Miller"}


def test_a_middle_name_lands_in_the_middle():
    assert split_name("Luis Miguel Ortega") == {
        "first_name": "Luis", "middle_name": "Miguel", "last_name": "Ortega"}


def test_last_comma_first_is_honoured():
    assert split_name("Ortega, Luis Miguel") == {
        "first_name": "Luis", "middle_name": "Miguel", "last_name": "Ortega"}


def test_a_surname_particle_stays_with_the_surname():
    assert split_name("Ana de la Cruz") == {
        "first_name": "Ana", "middle_name": None, "last_name": "de la Cruz"}


def test_a_suffix_is_not_a_surname():
    assert split_name("Ray Carter Jr.") == {
        "first_name": "Ray", "middle_name": None, "last_name": "Carter Jr."}


def test_one_token_is_read_as_a_surname():
    assert split_name("Nguyen") == {
        "first_name": None, "middle_name": None, "last_name": "Nguyen"}


def test_ragged_whitespace_does_not_survive():
    assert split_name("  Thu   Nguyen \n") == {
        "first_name": "Thu", "middle_name": None, "last_name": "Nguyen"}


def test_nothing_in_nothing_out():
    assert split_name("") == {
        "first_name": None, "middle_name": None, "last_name": None}
    assert split_name(None)["last_name"] is None


def test_explicit_parts_are_never_second_guessed():
    payload = apply_name({"full_name": "Wrong Person", "first_name": "Thu",
                          "last_name": "Nguyen"})
    assert payload["first_name"] == "Thu"
    assert payload["last_name"] == "Nguyen"
    assert "full_name" not in payload


def test_a_whole_name_fills_the_parts():
    payload = apply_name({"full_name": "Sam Boyd"})
    assert payload == {"first_name": "Sam", "last_name": "Boyd"}
